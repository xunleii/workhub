import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { ExitCode, type AppConfig } from '../types.js';
import { resolveConfigPath } from './config.js';
import type { WorkspaceConfig, WorkspaceSummary } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

const VALID_WORKSPACE_NAME = /^[a-zA-Z0-9-]+$/;

function validateWorkspaceName(name: string): void {
  if (!VALID_WORKSPACE_NAME.test(name)) {
    throw new Error(`Invalid workspace name: "${name}". Use only alphanumeric characters and hyphens.`);
  }
}

export function resolveWorkspacesDir(): string {
  return join(dirname(resolveConfigPath()), 'workspaces');
}

export function buildWorktreePath(repoPath: string, workspaceName: string): string {
  return join(dirname(repoPath), `${basename(repoPath)}-${workspaceName}`);
}

export async function saveWorkspace(config: WorkspaceConfig): Promise<void> {
  validateWorkspaceName(config.name);

  const workspacesDirectory = resolveWorkspacesDir();
  const finalConfig: WorkspaceConfig = {
    ...config,
    created_at: config.created_at || new Date().toISOString(),
  };
  const workspacePath = join(workspacesDirectory, `${config.name}.yaml`);
  const temporaryWorkspacePath = `${workspacePath}.tmp`;

  await mkdir(workspacesDirectory, { recursive: true });

  try {
    await writeFile(temporaryWorkspacePath, yaml.dump(finalConfig), 'utf8');
    await rename(temporaryWorkspacePath, workspacePath);
  } catch (error) {
    try {
      await unlink(temporaryWorkspacePath);
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}

export async function loadWorkspace(name: string): Promise<WorkspaceConfig> {
  const workspacePath = join(resolveWorkspacesDir(), `${name}.yaml`);

  try {
    const rawWorkspace = await readFile(workspacePath, 'utf8');
    return yaml.load(rawWorkspace) as WorkspaceConfig;
  } catch {
    throw new Error(`Workspace not found: ${name}`);
  }
}

export async function listWorkspaces(): Promise<string[]> {
  try {
    const entries = await readdir(resolveWorkspacesDir());

    return entries
      .filter((entry) => entry.endsWith('.yaml'))
      .map((entry) => entry.slice(0, -5))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export async function addPath(
  workspaceName: string,
  entry: { repo: string; path: string },
): Promise<void> {
  const workspace = await loadWorkspace(workspaceName);
  workspace.paths.push(entry);
  await saveWorkspace(workspace);
}

export async function removePath(workspaceName: string, repoName: string): Promise<string> {
  const workspace = await loadWorkspace(workspaceName);
  const index = workspace.paths.findIndex((workspacePath) => workspacePath.repo === repoName);

  if (index === -1) {
    throw new Error(`repository not in workspace: ${repoName}`);
  }

  const [removedPath] = workspace.paths.splice(index, 1);
  await saveWorkspace(workspace);

  return removedPath.path;
}

export async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const workspaceNames = await listWorkspaces();
  const summaries = await Promise.all(
    workspaceNames.map(async (name) => {
      const workspace = await loadWorkspace(name);
      const staleChecks = await Promise.all(
        workspace.paths.map(async (workspacePath) => {
          try {
            await access(workspacePath.path);
            return false;
          } catch {
            return true;
          }
        }),
      );

      return {
        name,
        staleCount: staleChecks.filter(Boolean).length,
      };
    }),
  );

  return summaries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function deleteWorkspace(name: string): Promise<void> {
  const workspacePath = join(resolveWorkspacesDir(), `${name}.yaml`);

  try {
    await rm(workspacePath);
  } catch {
    throw new Error(`Workspace not found: ${name}`);
  }
}

export function validateEditorBinary(editor: string): void {
  const result = spawnSync('which', [editor], { encoding: 'utf8' });

  if (result.status !== 0) {
    printError(`editor not found in PATH: ${editor}`);
    exitWithCode(ExitCode.ToolError);
  }
}

export function openWorkspace(workspace: WorkspaceConfig, config: AppConfig): void {
  const paths = workspace.paths.map((workspacePath) => workspacePath.path);
  const editorProcess = spawn(config.editor, paths, {
    detached: true,
    stdio: 'ignore',
  });

  editorProcess.unref();
}
