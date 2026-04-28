import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { resolveConfigPath } from './config.js';
import type { WorkspaceConfig } from '../types.js';

const VALID_WORKSPACE_NAME = /^[a-zA-Z0-9-]+$/;

function validateWorkspaceName(name: string): void {
  if (!VALID_WORKSPACE_NAME.test(name)) {
    throw new Error(`Invalid workspace name: "${name}". Use only alphanumeric characters and hyphens.`);
  }
}

export function resolveWorkspacesDir(): string {
  return join(dirname(resolveConfigPath()), 'workspaces');
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

export async function deleteWorkspace(name: string): Promise<void> {
  const workspacePath = join(resolveWorkspacesDir(), `${name}.yaml`);

  try {
    await rm(workspacePath);
  } catch {
    throw new Error(`Workspace not found: ${name}`);
  }
}
