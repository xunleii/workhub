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

describe('src/commands/new', () => {
  async function loadNewCommand(options?: {
    isTTY?: boolean;
    listWorkspacesResult?: string[];
    scanOriginsResult?: Array<{ name: string; path: string }>;
    createWorktreeImplementation?: (repoPath: string, branch: string, worktreePath: string) => Promise<void>;
  }) {
    const printError = vi.fn();
    const printPreview = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const promptWorkspaceName = vi.fn();
    const promptRepoSelection = vi.fn();
    const promptBranchName = vi.fn();
    const createWorktree = vi.fn(
      options?.createWorktreeImplementation ?? (async () => undefined),
    );
    const saveWorkspace = vi.fn(async () => undefined);
    const openWorkspace = vi.fn();
    const validateEditorBinary = vi.fn();
    const listWorkspaces = vi.fn(async () => options?.listWorkspacesResult ?? []);
    const scanOrigins = vi.fn(async () => options?.scanOriginsResult ?? [
      { name: 'repo-a', path: '/tmp/origins/repo-a' },
      { name: 'repo-b', path: '/tmp/origins/repo-b' },
    ]);

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: options?.isTTY ?? false,
      printError,
      printPreview,
      exitWithCode,
    }));

    vi.doMock('../../../src/ui/prompts.js', () => ({
      promptWorkspaceName,
      promptRepoSelection,
      promptBranchName,
    }));

    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(() => ({
        origins: '/tmp/origins',
        editor: 'zed',
      })),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      createWorktree,
      findOriginRepo: vi.fn((repositories: Array<{ name: string; path: string }>, name: string) =>
        repositories.find((repository) => repository.name === name || repository.name.split('/').at(-1) === name) ?? null),
      listLocalBranches: vi.fn(async () => []),
      listWorktreeBranches: vi.fn(async () => []),
      scanOrigins,
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      buildWorktreePath: vi.fn((repoPath: string, workspaceName: string) =>
        `${repoPath}/.git/worktrees/${workspaceName}/${repoPath.split('/').at(-1)}`),
      listWorkspaces,
      saveWorkspace,
      resolveWorkspacesDir: vi.fn(() => '/tmp/config/workspaces'),
      openWorkspace,
      validateEditorBinary,
      sanitizeWorkspaceName: (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_'),
    }));

    const { newCommand } = await import('../../../src/commands/new.js');

    return {
      newCommand,
      mocks: {
        createWorktree,
        exitWithCode,
        listWorkspaces,
        openWorkspace,
        printError,
        printPreview,
        promptBranchName,
        promptRepoSelection,
        promptWorkspaceName,
        saveWorkspace,
        scanOrigins,
        validateEditorBinary,
      },
    };
  }

  it('flag-only invocation creates the expected workspace structure', async () => {
    const { newCommand, mocks } = await loadNewCommand();

    await newCommand.parseAsync(
      ['node', 'new', 'ticket-1234', '--repo', 'repo-a', '--repo', 'repo-b', '--branch', 'feature/x'],
      { from: 'node' },
    );

    expect(mocks.promptWorkspaceName).not.toHaveBeenCalled();
    expect(mocks.promptRepoSelection).not.toHaveBeenCalled();
    expect(mocks.promptBranchName).not.toHaveBeenCalled();
    expect(mocks.validateEditorBinary).toHaveBeenCalledWith('zed');
    expect(mocks.createWorktree).toHaveBeenNthCalledWith(
      1,
      '/tmp/origins/repo-a',
      'feature/x',
      '/tmp/origins/repo-a/.git/worktrees/ticket-1234/repo-a',
    );
    expect(mocks.createWorktree).toHaveBeenNthCalledWith(
      2,
      '/tmp/origins/repo-b',
      'feature/x',
      '/tmp/origins/repo-b/.git/worktrees/ticket-1234/repo-b',
    );
    expect(mocks.printPreview).toHaveBeenCalledTimes(1);
    expect(mocks.saveWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1);
  });

  it('duplicate name errors before any workspace file is written', async () => {
    const { newCommand, mocks } = await loadNewCommand({
      listWorkspacesResult: ['ticket-1234'],
    });

    await expect(
      newCommand.parseAsync(
        ['node', 'new', 'ticket-1234', '--repo', 'repo-a', '--branch', 'feature/x'],
        { from: 'node' },
      ),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('Workspace already exists: ticket-1234');
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });

  it('worktree failure prevents workspace persistence', async () => {
    const { newCommand, mocks } = await loadNewCommand({
      createWorktreeImplementation: async (repoPath: string) => {
        throw new Error(`boom:${repoPath}`);
      },
    });

    await expect(
      newCommand.parseAsync(
        ['node', 'new', 'ticket-1234', '--repo', 'repo-a', '--branch', 'feature/x'],
        { from: 'node' },
      ),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith(
      'Failed to create worktree for repo-a: boom:/tmp/origins/repo-a',
    );
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
    expect(mocks.openWorkspace).not.toHaveBeenCalled();
  });

  it('empty origins fail with a user-facing error before opening the repository prompt', async () => {
    const { newCommand, mocks } = await loadNewCommand({
      isTTY: true,
      scanOriginsResult: [],
    });

    await expect(
      newCommand.parseAsync(['node', 'new', 'ticket-1234'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('No repositories found in origins: /tmp/origins');
    expect(mocks.promptRepoSelection).not.toHaveBeenCalled();
    expect(mocks.promptBranchName).not.toHaveBeenCalled();
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });
});
