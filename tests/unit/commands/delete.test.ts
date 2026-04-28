import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../../src/core/config.js');
  vi.doUnmock('../../../src/core/git.js');
  vi.doUnmock('../../../src/core/workspace.js');
  vi.doUnmock('../../../src/ui/output.js');
  vi.doUnmock('../../../src/ui/prompts.js');
});

describe('src/commands/delete', () => {
  async function loadDeleteCommand(options?: {
    loadWorkspaceImplementation?: () => Promise<{
      name: string;
      branch: string;
      created_at: string;
      paths: Array<{ repo: string; path: string }>;
    }>;
    removeWorktreeImplementation?: (repoPath: string, worktreePath: string) => Promise<void>;
    deleteWorkspaceImplementation?: (name: string) => Promise<void>;
    runDestructiveFlowImplementation?: (options: {
      paths: Array<{ path: string }>;
      operations: Array<{ type: 'REMOVE' | 'DELETE'; path: string }>;
      force: boolean;
    }) => Promise<void>;
  }) {
    const deleteWorkspace = vi.fn(options?.deleteWorkspaceImplementation ?? (async () => undefined));
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const loadWorkspace = vi.fn(
      options?.loadWorkspaceImplementation
        ?? (async () => ({
            name: 'ticket-1234',
            branch: 'feature/x',
            created_at: '2026-04-28T00:00:00.000Z',
            paths: [
              { repo: 'repo-a', path: '/tmp/repo-a-ticket-1234' },
              { repo: 'repo-b', path: '/tmp/repo-b-ticket-1234' },
            ],
          })),
    );
    const printError = vi.fn();
    const removeWorktree = vi.fn(options?.removeWorktreeImplementation ?? (async () => undefined));
    const runDestructiveFlow = vi.fn(options?.runDestructiveFlowImplementation ?? (async () => undefined));

    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(() => ({
        origins: '/tmp/origins',
        editor: 'zed',
      })),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      removeWorktree,
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      deleteWorkspace,
      loadWorkspace,
      resolveWorkspacesDir: vi.fn(() => '/tmp/config/workspaces'),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      exitWithCode,
      printError,
    }));

    vi.doMock('../../../src/ui/prompts.js', () => ({
      runDestructiveFlow,
    }));

    const { deleteCommand } = await import('../../../src/commands/delete.js');

    return {
      deleteCommand,
      mocks: {
        deleteWorkspace,
        exitWithCode,
        loadWorkspace,
        printError,
        removeWorktree,
        runDestructiveFlow,
      },
    };
  }

  it('workspace not found exits with ToolError without deleting anything', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand({
      loadWorkspaceImplementation: async () => {
        throw new Error('Workspace not found');
      },
    });

    await expect(deleteCommand.parseAsync(['node', 'delete', 'ticket-1234'], { from: 'node' })).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('workspace not found: ticket-1234');
    expect(mocks.runDestructiveFlow).not.toHaveBeenCalled();
    expect(mocks.removeWorktree).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('dirty worktree exits with GitSafetyBlock and does not delete anything', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand({
      runDestructiveFlowImplementation: async () => {
        throw new Error('exit:3');
      },
    });

    await expect(deleteCommand.parseAsync(['node', 'delete', 'ticket-1234'], { from: 'node' })).rejects.toThrow('exit:3');

    expect(mocks.removeWorktree).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('--force with unpushed worktrees is still blocked by safety checks', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand({
      runDestructiveFlowImplementation: async () => {
        throw new Error('exit:3');
      },
    });

    await expect(
      deleteCommand.parseAsync(['node', 'delete', 'ticket-1234', '--force'], { from: 'node' }),
    ).rejects.toThrow('exit:3');

    expect(mocks.runDestructiveFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
      }),
    );
    expect(mocks.removeWorktree).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('successful delete with --force skips confirmation flow and removes worktrees', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand();

    await expect(
      deleteCommand.parseAsync(['node', 'delete', 'ticket-1234', '--force'], { from: 'node' }),
    ).rejects.toThrow('exit:0');

    expect(mocks.runDestructiveFlow).toHaveBeenCalledWith({
      paths: [
        { repo: 'repo-a', path: '/tmp/repo-a-ticket-1234' },
        { repo: 'repo-b', path: '/tmp/repo-b-ticket-1234' },
      ],
      operations: [
        { type: 'REMOVE', path: '/tmp/repo-a-ticket-1234' },
        { type: 'REMOVE', path: '/tmp/repo-b-ticket-1234' },
        { type: 'DELETE', path: '/tmp/config/workspaces/ticket-1234.yaml' },
      ],
      force: true,
    });
    expect(mocks.removeWorktree).toHaveBeenNthCalledWith(1, '/tmp/origins/repo-a', '/tmp/repo-a-ticket-1234');
    expect(mocks.removeWorktree).toHaveBeenNthCalledWith(2, '/tmp/origins/repo-b', '/tmp/repo-b-ticket-1234');
    expect(mocks.deleteWorkspace).toHaveBeenCalledWith('ticket-1234');
    expect(mocks.exitWithCode).toHaveBeenCalledWith(0);
  });

  it('non-TTY without --force exits with ToolError', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand({
      runDestructiveFlowImplementation: async () => {
        throw new Error('exit:2');
      },
    });

    await expect(deleteCommand.parseAsync(['node', 'delete', 'ticket-1234'], { from: 'node' })).rejects.toThrow('exit:2');

    expect(mocks.removeWorktree).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('continues best-effort cleanup when a worktree removal fails', async () => {
    const { deleteCommand, mocks } = await loadDeleteCommand({
      removeWorktreeImplementation: async (repoPath: string) => {
        if (repoPath.endsWith('repo-a')) {
          throw new Error('boom');
        }
      },
    });

    await expect(
      deleteCommand.parseAsync(['node', 'delete', 'ticket-1234', '--force'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.removeWorktree).toHaveBeenCalledTimes(2);
    expect(mocks.deleteWorkspace).toHaveBeenCalledWith('ticket-1234');
    expect(mocks.printError).toHaveBeenCalledWith('Failed to remove worktree at /tmp/repo-a-ticket-1234: boom');
    expect(mocks.exitWithCode).toHaveBeenCalledWith(2);
  });
});
