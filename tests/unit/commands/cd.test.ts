import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../../src/core/workspace.js');
  vi.doUnmock('../../../src/ui/output.js');
  vi.doUnmock('../../../src/ui/prompts.js');
});

describe('src/commands/cd', () => {
  const baseWorkspace = {
    name: 'ticket-1234',
    branch: 'feature/x',
    created_at: '2024-01-01T00:00:00.000Z',
    paths: [
      { repo: 'repo-a', path: '/tmp/origins/repo-a/.git/worktrees/ticket-1234/repo-a' },
      { repo: 'repo-b', path: '/tmp/origins/repo-b/.git/worktrees/ticket-1234/repo-b' },
    ],
  };

  async function loadCdCommand(options?: {
    isTTY?: boolean;
    workspace?: typeof baseWorkspace | null;
    promptWorkspaceSelectResult?: string;
    promptRepoSelectResult?: string;
  }) {
    const printError = vi.fn();
    const exitWithCode = vi.fn((code: number) => { throw new Error(`exit:${code}`); });
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const promptWorkspaceSelect = vi.fn(async () => options?.promptWorkspaceSelectResult ?? 'ticket-1234');
    const promptRepoSelect = vi.fn(async () => options?.promptRepoSelectResult ?? baseWorkspace.paths[0].path);

    const workspace = options?.workspace === undefined ? baseWorkspace : options.workspace;

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: options?.isTTY ?? false,
      printError,
      exitWithCode,
    }));

    vi.doMock('../../../src/ui/prompts.js', () => ({
      promptWorkspaceSelect,
      promptRepoSelect,
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      listWorkspaceSummaries: vi.fn(async () =>
        workspace ? [{ name: workspace.name, staleCount: 0 }] : [],
      ),
      loadWorkspace: vi.fn(async (name: string) => {
        if (!workspace || workspace.name !== name) throw new Error(`Workspace not found: ${name}`);
        return workspace;
      }),
    }));

    const { cdCommand } = await import('../../../src/commands/cd.js');

    return {
      cdCommand,
      mocks: { printError, exitWithCode, stdoutWrite, promptWorkspaceSelect, promptRepoSelect },
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the path when workspace and repo are provided as arguments', async () => {
    const { cdCommand, mocks } = await loadCdCommand();

    await cdCommand.parseAsync(['node', 'cd', 'ticket-1234', 'repo-a'], { from: 'node' });

    expect(mocks.stdoutWrite).toHaveBeenCalledWith(
      `${baseWorkspace.paths[0].path}\n`,
    );
    expect(mocks.promptWorkspaceSelect).not.toHaveBeenCalled();
    expect(mocks.promptRepoSelect).not.toHaveBeenCalled();
  });

  it('prints the path directly when workspace has a single repo and no repo arg is given', async () => {
    const singleRepoWorkspace = { ...baseWorkspace, paths: [baseWorkspace.paths[0]] };
    const { cdCommand, mocks } = await loadCdCommand({ workspace: singleRepoWorkspace });

    await cdCommand.parseAsync(['node', 'cd', 'ticket-1234'], { from: 'node' });

    expect(mocks.stdoutWrite).toHaveBeenCalledWith(`${singleRepoWorkspace.paths[0].path}\n`);
    expect(mocks.promptRepoSelect).not.toHaveBeenCalled();
  });

  it('prompts for repo when workspace has multiple repos and no repo arg is given (TTY)', async () => {
    const selectedPath = baseWorkspace.paths[1].path;
    const { cdCommand, mocks } = await loadCdCommand({
      isTTY: true,
      promptWorkspaceSelectResult: 'ticket-1234',
      promptRepoSelectResult: selectedPath,
    });

    await cdCommand.parseAsync(['node', 'cd', 'ticket-1234'], { from: 'node' });

    expect(mocks.promptRepoSelect).toHaveBeenCalledOnce();
    expect(mocks.stdoutWrite).toHaveBeenCalledWith(`${selectedPath}\n`);
  });

  it('prompts for workspace when no argument is given (TTY)', async () => {
    const { cdCommand, mocks } = await loadCdCommand({
      isTTY: true,
      promptWorkspaceSelectResult: 'ticket-1234',
      promptRepoSelectResult: baseWorkspace.paths[0].path,
    });

    await cdCommand.parseAsync(['node', 'cd'], { from: 'node' });

    expect(mocks.promptWorkspaceSelect).toHaveBeenCalledOnce();
  });

  it('exits with ToolError in non-TTY mode when workspace is missing', async () => {
    const { cdCommand, mocks } = await loadCdCommand({ isTTY: false });

    await expect(
      cdCommand.parseAsync(['node', 'cd'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('workspace name required in non-TTY mode');
  });

  it('exits with ToolError in non-TTY mode when repo is missing and workspace has multiple repos', async () => {
    const { cdCommand, mocks } = await loadCdCommand({ isTTY: false });

    await expect(
      cdCommand.parseAsync(['node', 'cd', 'ticket-1234'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith(
      'repo name required in non-TTY mode when workspace has multiple repositories',
    );
  });

  it('exits with ToolError when the workspace is not found', async () => {
    const { cdCommand, mocks } = await loadCdCommand({ workspace: null });

    await expect(
      cdCommand.parseAsync(['node', 'cd', 'unknown-workspace'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('workspace not found: unknown-workspace');
  });

  it('exits with ToolError when the requested repo is not in the workspace', async () => {
    const { cdCommand, mocks } = await loadCdCommand();

    await expect(
      cdCommand.parseAsync(['node', 'cd', 'ticket-1234', 'repo-z'], { from: 'node' }),
    ).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('repository not in workspace: repo-z');
  });
});
