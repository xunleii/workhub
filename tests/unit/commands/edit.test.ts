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

describe('src/commands/edit', () => {
  async function loadEditCommand(options?: {
    isTTY?: boolean;
    workspacePaths?: Array<{ repo: string; path: string }>;
    repositories?: Array<{ name: string; path: string }>;
  }) {
    const addPath = vi.fn();
    const createWorktree = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const loadWorkspace = vi.fn(async () => ({
      name: 'ticket-1234',
      branch: 'feature/x',
      created_at: '2026-04-28T00:00:00.000Z',
      paths: options?.workspacePaths ?? [{ repo: 'repo-a', path: '/tmp/repo-a-ticket-1234' }],
    }));
    const printError = vi.fn();
    const printSuccess = vi.fn();
    const promptBranchName = vi.fn(async () => 'feature/x');
    const scanOrigins = vi.fn(async () => options?.repositories ?? [{ name: 'repo-b', path: '/tmp/repo-b' }]);

    vi.doMock('../../../src/ui/output.js', () => ({
      exitWithCode,
      isTTY: options?.isTTY ?? false,
      printError,
      printSuccess,
    }));

    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(() => ({
        origins: '/tmp/origins',
        editor: 'zed',
      })),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      createWorktree,
      scanOrigins,
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      addPath,
      buildWorktreePath: vi.fn((repoPath: string, workspaceName: string) => `${repoPath}-${workspaceName}`),
      loadWorkspace,
    }));

    vi.doMock('../../../src/ui/prompts.js', () => ({
      promptBranchName,
    }));

    const { editCommand } = await import('../../../src/commands/edit.js');

    return {
      editCommand,
      mocks: {
        addPath,
        createWorktree,
        exitWithCode,
        loadWorkspace,
        printError,
        printSuccess,
        promptBranchName,
        scanOrigins,
      },
    };
  }

  it('missing --branch in non-TTY mode exits with ToolError', async () => {
    const { editCommand, mocks } = await loadEditCommand({ isTTY: false });

    await expect(
      editCommand.parseAsync(['node', 'edit', 'ticket-1234', '--add', 'repo-b'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('--branch is required');
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.addPath).not.toHaveBeenCalled();
  });

  it('repo not in origins exits with ToolError without modifying the workspace', async () => {
    const { editCommand, mocks } = await loadEditCommand({
      repositories: [{ name: 'repo-a', path: '/tmp/repo-a' }],
    });

    await expect(
      editCommand.parseAsync(
        ['node', 'edit', 'ticket-1234', '--add', 'repo-b', '--branch', 'feature/x'],
        { from: 'node' },
      ),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('repository not found in origins: repo-b');
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.addPath).not.toHaveBeenCalled();
  });

  it('repo already in workspace exits with ToolError without modifying the workspace', async () => {
    const { editCommand, mocks } = await loadEditCommand({
      workspacePaths: [{ repo: 'repo-b', path: '/tmp/repo-b-ticket-1234' }],
    });

    await expect(
      editCommand.parseAsync(
        ['node', 'edit', 'ticket-1234', '--add', 'repo-b', '--branch', 'feature/x'],
        { from: 'node' },
      ),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('repository already in workspace: repo-b');
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.addPath).not.toHaveBeenCalled();
  });

  it('creates the worktree and appends the path on success', async () => {
    const { editCommand, mocks } = await loadEditCommand();

    await editCommand.parseAsync(
      ['node', 'edit', 'ticket-1234', '--add', 'repo-b', '--branch', 'feature/x'],
      { from: 'node' },
    );

    expect(mocks.createWorktree).toHaveBeenCalledWith('/tmp/repo-b', 'feature/x', '/tmp/repo-b-ticket-1234');
    expect(mocks.addPath).toHaveBeenCalledWith('ticket-1234', {
      repo: 'repo-b',
      path: '/tmp/repo-b-ticket-1234',
    });
    expect(mocks.printSuccess).toHaveBeenCalledWith('Added repo-b to workspace ticket-1234');
  });
});
