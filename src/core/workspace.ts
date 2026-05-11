import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { ExitCode, type AppConfig } from '../types.js';
import { resolveConfigPath } from './config.js';
import type { WorkspaceConfig, WorkspaceSummary } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

/**
 * Converts a display workspace name into a filesystem-safe filename stem.
 *
 * Any character outside `[a-zA-Z0-9._-]` (e.g. spaces, slashes) is replaced
 * by an underscore so the result is safe as a directory name and YAML filename.
 *
 * @param name - Display workspace name (may contain spaces, slashes, etc.).
 * @returns Filesystem-safe equivalent.
 */
export function sanitizeWorkspaceName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Resolves the directory where workspace manifests are stored.
 *
 * @returns Absolute path to the workspaces directory.
 */
export function resolveWorkspacesDir(): string {
  return join(dirname(resolveConfigPath()), 'workspaces');
}

/**
 * Builds the on-disk worktree path for a repository/workspace combination.
 *
 * @param repoPath - Absolute path of the source repository under origins.
 * @param workspaceName - Workspace name used as the worktree grouping directory.
 * @returns Absolute path of the derived worktree location inside the repository Git metadata.
 */
export function buildWorktreePath(repoPath: string, workspaceName: string): string {
  return join(repoPath, '.git', 'worktrees', sanitizeWorkspaceName(workspaceName), basename(repoPath));
}

/**
 * Persists a workspace manifest using an atomic write strategy.
 *
 * @param config - Workspace configuration to serialize.
 */
export async function saveWorkspace(config: WorkspaceConfig): Promise<void> {
  const workspacesDirectory = resolveWorkspacesDir();
  const finalConfig: WorkspaceConfig = {
    ...config,
    created_at: config.created_at || new Date().toISOString(),
  };
  const workspacePath = join(workspacesDirectory, `${sanitizeWorkspaceName(config.name)}.yaml`);
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

/**
 * Loads a workspace manifest by name.
 *
 * @param name - Workspace identifier.
 * @returns Parsed workspace configuration.
 * @throws {Error} When the workspace manifest cannot be read.
 */
export async function loadWorkspace(name: string): Promise<WorkspaceConfig> {
  const workspacePath = join(resolveWorkspacesDir(), `${sanitizeWorkspaceName(name)}.yaml`);

  try {
    const rawWorkspace = await readFile(workspacePath, 'utf8');
    return yaml.load(rawWorkspace) as WorkspaceConfig;
  } catch {
    throw new Error(`Workspace not found: ${name}`);
  }
}

/**
 * Lists saved workspaces, sorted by display name.
 *
 * Each YAML manifest is read to retrieve the original display name, which may
 * differ from the sanitized filename when the name contains spaces or slashes.
 *
 * @returns Display workspace names discovered in the manifest directory.
 */
export async function listWorkspaces(): Promise<string[]> {
  try {
    const workspacesDirectory = resolveWorkspacesDir();
    const entries = await readdir(workspacesDirectory);
    const names = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.yaml') && !entry.endsWith('.yaml.tmp'))
        .map(async (entry) => {
          try {
            const raw = await readFile(join(workspacesDirectory, entry), 'utf8');
            return (yaml.load(raw) as WorkspaceConfig).name;
          } catch {
            return null;
          }
        }),
    );

    return names
      .filter((n): n is string => n !== null)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

/**
 * Appends a repository entry to an existing workspace and saves the result.
 *
 * @param workspaceName - Workspace to update.
 * @param entry - Repository/path pair to append.
 */
export async function addPath(
  workspaceName: string,
  entry: { repo: string; path: string },
): Promise<void> {
  const workspace = await loadWorkspace(workspaceName);
  workspace.paths.push(entry);
  await saveWorkspace(workspace);
}

/**
 * Removes a repository entry from an existing workspace without touching disk.
 *
 * @param workspaceName - Workspace to update.
 * @param repoName - Repository identifier to remove.
 * @returns The worktree path that was disassociated from the workspace.
 * @throws {Error} When the repository is not part of the workspace.
 */
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

/**
 * Produces lightweight workspace summaries including stale-path counts.
 *
 * @returns Sorted summaries suitable for interactive selection UIs.
 */
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

/**
 * Deletes a persisted workspace manifest.
 *
 * @param name - Workspace name to remove.
 * @throws {Error} When the workspace manifest does not exist.
 */
export async function deleteWorkspace(name: string): Promise<void> {
  const workspacePath = join(resolveWorkspacesDir(), `${sanitizeWorkspaceName(name)}.yaml`);

  try {
    await rm(workspacePath);
  } catch {
    throw new Error(`Workspace not found: ${name}`);
  }
}

/**
 * Verifies that the configured editor executable is available in `PATH`.
 *
 * @param editor - Binary name to resolve.
 */
export function validateEditorBinary(editor: string): void {
  const result = spawnSync('which', [editor], { encoding: 'utf8' });

  if (result.status !== 0) {
    printError(`editor not found in PATH: ${editor}`);
    exitWithCode(ExitCode.ToolError);
  }
}

/**
 * Launches the configured editor with every path from a workspace.
 *
 * The editor process is detached so the CLI can exit immediately.
 *
 * @param workspace - Workspace whose paths should be opened.
 * @param config - Active application configuration.
 */
export function openWorkspace(workspace: WorkspaceConfig, config: AppConfig): void {
  const paths = workspace.paths.map((workspacePath) => workspacePath.path);
  const editorProcess = spawn(config.editor, paths, {
    detached: true,
    stdio: 'ignore',
  });

  editorProcess.unref();
}
