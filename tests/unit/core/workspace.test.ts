import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceConfig } from '../../../src/types.js';
import { sanitizeWorkspaceName } from '../../../src/core/workspace.js';

describe('src/core/workspace', () => {
  let testDirectory: string;

  const baseWorkspaceConfig: WorkspaceConfig = {
    name: 'ticket-1234',
    branch: 'feature/new-api',
    created_at: '2026-04-27T10:00:00.000Z',
    paths: [
      { repo: 'repo-a', path: '/tmp/repos/repo-a/.git/worktrees/ticket-1234/repo-a' },
      { repo: 'repo-b', path: '/tmp/repos/repo-b/.git/worktrees/ticket-1234/repo-b' },
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
    vi.doUnmock('node:child_process');
    vi.doUnmock('../../../src/ui/output.js');
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

  it('addPath appends a repository entry and persists it atomically', async () => {
    const { addPath, loadWorkspace, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);
    await addPath('ticket-1234', {
      repo: 'repo-c',
      path: '/tmp/repos/repo-c/.git/worktrees/ticket-1234/repo-c',
    });

    await expect(loadWorkspace('ticket-1234')).resolves.toEqual({
      ...baseWorkspaceConfig,
      paths: [
        ...baseWorkspaceConfig.paths,
        { repo: 'repo-c', path: '/tmp/repos/repo-c/.git/worktrees/ticket-1234/repo-c' },
      ],
    });
  });

  it('removePath removes the matching repository entry and saves the workspace', async () => {
    const { loadWorkspace, removePath, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);

    await expect(removePath('ticket-1234', 'repo-b')).resolves.toBe('/tmp/repos/repo-b/.git/worktrees/ticket-1234/repo-b');
    await expect(loadWorkspace('ticket-1234')).resolves.toEqual({
      ...baseWorkspaceConfig,
      paths: [{ repo: 'repo-a', path: '/tmp/repos/repo-a/.git/worktrees/ticket-1234/repo-a' }],
    });
  });

  it('removePath throws when the repository is not in the workspace', async () => {
    const { removePath, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace(baseWorkspaceConfig);

    await expect(removePath('ticket-1234', 'repo-c')).rejects.toThrow('repository not in workspace: repo-c');
  });

  it('removePath does not delete the worktree directory from disk', async () => {
    const worktreeDirectory = join(testDirectory, 'repo-b', '.git', 'worktrees', 'ticket-1234', 'repo-b');
    const { removePath, saveWorkspace } = await import('../../../src/core/workspace.js');

    await mkdir(worktreeDirectory, { recursive: true });
    await saveWorkspace({
      ...baseWorkspaceConfig,
      paths: [{ repo: 'repo-b', path: worktreeDirectory }],
    });

    await removePath('ticket-1234', 'repo-b');

    await expect(access(worktreeDirectory)).resolves.toBeUndefined();
  });

  it('saveWorkspace stores names with spaces under a sanitized filename', async () => {
    const { resolveWorkspacesDir, saveWorkspace, loadWorkspace } = await import('../../../src/core/workspace.js');

    const spacedConfig = { ...baseWorkspaceConfig, name: 'my feature/AUTH 123' };

    await saveWorkspace(spacedConfig);

    // File uses sanitized name; original name is NOT a file.
    await expect(access(join(resolveWorkspacesDir(), 'my_feature_AUTH_123.yaml'))).resolves.toBeUndefined();
    await expect(access(join(resolveWorkspacesDir(), 'my feature/AUTH 123.yaml'))).rejects.toThrow();

    // loadWorkspace accepts either display or sanitized form.
    await expect(loadWorkspace('my feature/AUTH 123')).resolves.toMatchObject({ name: 'my feature/AUTH 123' });
    await expect(loadWorkspace('my_feature_AUTH_123')).resolves.toMatchObject({ name: 'my feature/AUTH 123' });
  });

  it('listWorkspaces returns display names (not sanitized filenames)', async () => {
    const { listWorkspaces, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace({ ...baseWorkspaceConfig, name: 'ticket-1234' });
    await saveWorkspace({ ...baseWorkspaceConfig, name: 'my feature/AUTH 123' });

    await expect(listWorkspaces()).resolves.toEqual(['my feature/AUTH 123', 'ticket-1234']);
  });

  it('saveWorkspace creates the workspaces directory automatically', async () => {
    const { resolveWorkspacesDir, saveWorkspace } = await import('../../../src/core/workspace.js');

    await expect(access(dirname(resolveWorkspacesDir()))).rejects.toThrow();

    await saveWorkspace(baseWorkspaceConfig);

    await expect(access(resolveWorkspacesDir())).resolves.toBeUndefined();
  });

  it('openWorkspace launches the editor with paths in order and detaches the process', async () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));

    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');

      return {
        ...actual,
        spawn,
      };
    });

    const { openWorkspace } = await import('../../../src/core/workspace.js');

    openWorkspace(baseWorkspaceConfig, {
      origins: '/tmp/origins',
      editor: 'zed',
    });

    expect(spawn).toHaveBeenCalledWith(
      'zed',
      [
        '/tmp/repos/repo-a/.git/worktrees/ticket-1234/repo-a',
        '/tmp/repos/repo-b/.git/worktrees/ticket-1234/repo-b',
      ],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('buildWorktreePath stores worktrees under repo .git/worktrees/<workspace>/<repo>', async () => {
    const { buildWorktreePath } = await import('../../../src/core/workspace.js');
    const repoPath = '/tmp/repos/group-a/repo-a';

    expect(buildWorktreePath(repoPath, 'ticket-1234')).toBe(
      join(repoPath, '.git', 'worktrees', 'ticket-1234', basename(repoPath)),
    );
  });

  it('buildWorktreePath sanitizes names with spaces and slashes in the path', async () => {
    const { buildWorktreePath } = await import('../../../src/core/workspace.js');
    const repoPath = '/tmp/repos/group-a/repo-a';

    expect(buildWorktreePath(repoPath, 'my feature/AUTH 123')).toBe(
      join(repoPath, '.git', 'worktrees', 'my_feature_AUTH_123', basename(repoPath)),
    );
  });

  it('validateEditorBinary exits with ToolError for an unknown binary', async () => {
    const printError = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });

    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');

      return {
        ...actual,
        spawnSync: vi.fn(() => ({ status: 1 })),
      };
    });

    vi.doMock('../../../src/ui/output.js', () => ({
      printError,
      exitWithCode,
    }));

    const { validateEditorBinary } = await import('../../../src/core/workspace.js');

    expect(() => validateEditorBinary('missing-editor')).toThrow('exit:2');
    expect(printError).toHaveBeenCalledWith('editor not found in PATH: missing-editor');
    expect(exitWithCode).toHaveBeenCalledWith(2);
  });

  it('listWorkspaceSummaries marks stale paths that no longer exist', async () => {
    const stalePath = join(testDirectory, 'missing-worktree');
    const validPath = join(testDirectory, 'existing-worktree');
    await mkdir(validPath, { recursive: true });

    const { listWorkspaceSummaries, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace({
      ...baseWorkspaceConfig,
      name: 'stale-workspace',
      paths: [
        { repo: 'repo-a', path: validPath },
        { repo: 'repo-b', path: stalePath },
      ],
    });

    await expect(listWorkspaceSummaries()).resolves.toEqual([
      { name: 'stale-workspace', staleCount: 1 },
    ]);
  });

  it('listWorkspaceSummaries reports zero stale paths for valid workspaces', async () => {
    const firstPath = join(testDirectory, 'worktree-a');
    const secondPath = join(testDirectory, 'worktree-b');
    await mkdir(firstPath, { recursive: true });
    await mkdir(secondPath, { recursive: true });

    const { listWorkspaceSummaries, saveWorkspace } = await import('../../../src/core/workspace.js');

    await saveWorkspace({
      ...baseWorkspaceConfig,
      name: 'healthy-workspace',
      paths: [
        { repo: 'repo-a', path: firstPath },
        { repo: 'repo-b', path: secondPath },
      ],
    });

    await expect(listWorkspaceSummaries()).resolves.toEqual([
      { name: 'healthy-workspace', staleCount: 0 },
    ]);
  });

  it('listWorkspaceSummaries returns empty array when no workspaces exist', async () => {
    const { listWorkspaceSummaries } = await import('../../../src/core/workspace.js');

    await expect(listWorkspaceSummaries()).resolves.toEqual([]);
  });
});

describe('sanitizeWorkspaceName', () => {
  it('leaves safe characters unchanged', () => {
    expect(sanitizeWorkspaceName('ticket-1234')).toBe('ticket-1234');
    expect(sanitizeWorkspaceName('my_workspace.v2')).toBe('my_workspace.v2');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeWorkspaceName('my workspace')).toBe('my_workspace');
  });

  it('replaces slashes with underscores', () => {
    expect(sanitizeWorkspaceName('feature/AUTH-123')).toBe('feature_AUTH-123');
  });

  it('replaces all unsafe characters', () => {
    expect(sanitizeWorkspaceName('foo bar/baz@qux')).toBe('foo_bar_baz_qux');
  });

  it('two names that differ only in unsafe chars produce identical sanitized forms', () => {
    expect(sanitizeWorkspaceName('my workspace')).toBe(sanitizeWorkspaceName('my_workspace'));
  });
});
