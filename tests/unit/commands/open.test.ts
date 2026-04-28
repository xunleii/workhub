import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../../src/core/config.js');
  vi.doUnmock('../../../src/core/workspace.js');
  vi.doUnmock('../../../src/ui/output.js');
  vi.doUnmock('../../../src/ui/prompts.js');
  vi.doUnmock('node:child_process');

  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('src/commands/open', () => {
  async function loadOpenCommand(options?: {
    isTTY?: boolean;
    loadWorkspaceImplementation?: () => Promise<{
      name: string;
      branch: string;
      created_at: string;
      paths: Array<{ repo: string; path: string }>;
    }>;
  }) {
    const printError = vi.fn();
    const printSuccess = vi.fn();
    const printWarning = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const validateEditorBinary = vi.fn();
    const listWorkspaceSummaries = vi.fn(async () => []);
    const promptWorkspaceSelect = vi.fn();
    const loadWorkspace = vi.fn(
      options?.loadWorkspaceImplementation
        ?? (async () => ({
            name: 'ticket-1234',
            branch: 'feature/x',
            created_at: '2026-04-28T00:00:00.000Z',
            paths: [],
          })),
    );
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: options?.isTTY ?? false,
      printError,
      printSuccess,
      printWarning,
      exitWithCode,
    }));

    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(() => ({
        origins: '/tmp/origins',
        editor: 'zed',
      })),
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      listWorkspaceSummaries,
      loadWorkspace,
      validateEditorBinary,
    }));

    vi.doMock('../../../src/ui/prompts.js', () => ({
      promptWorkspaceSelect,
    }));

    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');

      return {
        ...actual,
        spawn,
      };
    });

    const { openCommand } = await import('../../../src/commands/open.js');

    return {
      openCommand,
      mocks: {
        exitWithCode,
        listWorkspaceSummaries,
        loadWorkspace,
        printError,
        printSuccess,
        printWarning,
        promptWorkspaceSelect,
        spawn,
        unref,
        validateEditorBinary,
      },
    };
  }

  it('excludes stale paths from editor launch and prints warnings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workhub-open-'));
    temporaryDirectories.push(directory);
    const validPath = join(directory, 'valid-worktree');
    await mkdir(validPath, { recursive: true });
    const stalePath = join(directory, 'missing-worktree');

    const { openCommand, mocks } = await loadOpenCommand({
      loadWorkspaceImplementation: async () => ({
        name: 'ticket-1234',
        branch: 'feature/x',
        created_at: '2026-04-28T00:00:00.000Z',
        paths: [
          { repo: 'repo-a', path: validPath },
          { repo: 'repo-b', path: stalePath },
        ],
      }),
    });

    await openCommand.parseAsync(['node', 'open', 'ticket-1234'], { from: 'node' });

    expect(mocks.printWarning).toHaveBeenCalledWith(`Stale path excluded: ${stalePath}`);
    expect(mocks.spawn).toHaveBeenCalledWith(
      'zed',
      [validPath],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(mocks.unref).toHaveBeenCalledTimes(1);
  });

  it('workspace not found exits with ToolError', async () => {
    const { openCommand, mocks } = await loadOpenCommand({
      loadWorkspaceImplementation: async () => {
        throw new Error('Workspace not found');
      },
    });

    await expect(openCommand.parseAsync(['node', 'open', 'ticket-1234'], { from: 'node' })).rejects.toThrow(
      'exit:2',
    );

    expect(mocks.printError).toHaveBeenCalledWith('workspace not found: ticket-1234');
  });

  it('non-TTY without name exits with ToolError', async () => {
    const { openCommand, mocks } = await loadOpenCommand({
      isTTY: false,
    });

    await expect(openCommand.parseAsync(['node', 'open'], { from: 'node' })).rejects.toThrow('exit:2');

    expect(mocks.printError).toHaveBeenCalledWith('workspace name required in non-TTY mode');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
