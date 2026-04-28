import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceConfig } from '../../../src/types.js';

describe('src/core/workspace', () => {
  let testDirectory: string;

  const baseWorkspaceConfig: WorkspaceConfig = {
    name: 'ticket-1234',
    branch: 'feature/new-api',
    created_at: '2026-04-27T10:00:00.000Z',
    paths: [
      { repo: 'repo-a', path: '/tmp/repos/repo-a/.git/worktrees/feature-new-api' },
      { repo: 'repo-b', path: '/tmp/repos/repo-b/.git/worktrees/feature-new-api' },
    ],
  };

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'workhub-workspaces-'));
    process.env.XDG_CONFIG_HOME = testDirectory;
  });

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME;
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('node:fs/promises');
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('saveWorkspace writes the expected YAML file', async () => {
    const { saveWorkspace, resolveWorkspacesDir } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);

    const workspaceFile = join(resolveWorkspacesDir(), 'ticket-1234.yaml');
    const savedWorkspace = yaml.load(await readFile(workspaceFile, 'utf8')) as WorkspaceConfig;

    expect(savedWorkspace).toEqual(baseWorkspaceConfig);
  });

  it('atomic write cleans up the tmp file when rename fails', async () => {
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

      return {
        ...actual,
        rename: vi.fn(async () => {
          throw new Error('rename failed');
        }),
      };
    });

    const { resolveWorkspacesDir, saveWorkspace } = await import('../../../src/core/workspace.js');

    await expect(saveWorkspace(baseWorkspaceConfig)).rejects.toThrow('rename failed');
    await expect(access(join(resolveWorkspacesDir(), 'ticket-1234.yaml.tmp'))).rejects.toThrow();
  });

  it('loadWorkspace returns the saved typed object', async () => {
    const { loadWorkspace, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);

    await expect(loadWorkspace('ticket-1234')).resolves.toEqual(baseWorkspaceConfig);
  });

  it('listWorkspaces returns all workspace names', async () => {
    const { listWorkspaces, resolveWorkspacesDir, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);
    await saveWorkspace({
      ...baseWorkspaceConfig,
      name: 'ticket-5678',
    });
    await writeFile(join(resolveWorkspacesDir(), 'ignore-me.yaml.tmp'), 'tmp', 'utf8');

    await expect(listWorkspaces()).resolves.toEqual(['ticket-1234', 'ticket-5678']);
  });

  it('name validation rejects invalid characters before writing', async () => {
    const { resolveWorkspacesDir, saveWorkspace } = await import('../../../src/core/workspace.js');

    await expect(
      saveWorkspace({
        ...baseWorkspaceConfig,
        name: 'my workspace!',
      }),
    ).rejects.toThrow('Invalid workspace name: "my workspace!". Use only alphanumeric characters and hyphens.');

    await expect(access(join(resolveWorkspacesDir(), 'my workspace!.yaml'))).rejects.toThrow();
  });

  it('saveWorkspace creates the workspaces directory automatically', async () => {
    const { resolveWorkspacesDir, saveWorkspace } = await import('../../../src/core/workspace.js');

    await expect(access(dirname(resolveWorkspacesDir()))).rejects.toThrow();

    await saveWorkspace(baseWorkspaceConfig);

    await expect(access(resolveWorkspacesDir())).resolves.toBeUndefined();
  });
});
