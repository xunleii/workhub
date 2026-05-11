import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../../src/core/workspace.js');
  vi.doUnmock('../../../src/ui/output.js');
});

describe('src/commands/list', () => {
  async function loadListCommand(options?: {
    isTTY?: boolean;
    workspaces?: Array<{ name: string; branch: string; paths: Array<{ repo: string; path: string }> }>;
  }) {
    const printSuccess = vi.fn();
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const defaultWorkspaces = options?.workspaces ?? [];

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: options?.isTTY ?? false,
      printSuccess,
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      listWorkspaces: vi.fn(async () => defaultWorkspaces.map((workspace) => workspace.name)),
      loadWorkspace: vi.fn(async (name: string) => {
        const found = defaultWorkspaces.find((workspace) => workspace.name === name);
        if (!found) throw new Error(`Workspace not found: ${name}`);
        return { ...found, created_at: '2024-01-01T00:00:00.000Z' };
      }),
    }));

    const { listCommand } = await import('../../../src/commands/list.js');

    return { listCommand, mocks: { printSuccess, stdoutWrite } };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a message when no workspaces exist', async () => {
    const { listCommand, mocks } = await loadListCommand({ workspaces: [] });

    await listCommand.parseAsync(['node', 'list'], { from: 'node' });

    expect(mocks.printSuccess).toHaveBeenCalledWith('No workspaces found. Run `wh new` to create one.');
    expect(mocks.stdoutWrite).not.toHaveBeenCalled();
  });

  it('outputs tab-separated rows in non-TTY mode', async () => {
    const { listCommand, mocks } = await loadListCommand({
      isTTY: false,
      workspaces: [
        { name: 'ticket-1234', branch: 'feature/x', paths: [{ repo: 'repo-a', path: '/tmp/a' }] },
        { name: 'my-fix', branch: 'fix/y', paths: [{ repo: 'repo-a', path: '/tmp/a' }, { repo: 'repo-b', path: '/tmp/b' }] },
      ],
    });

    await listCommand.parseAsync(['node', 'list'], { from: 'node' });

    const output = mocks.stdoutWrite.mock.calls.map((call) => call[0]).join('');

    expect(output).toContain('ticket-1234\tfeature/x\trepo-a\n');
    expect(output).toContain('my-fix\tfix/y\trepo-a,repo-b\n');
  });

  it('outputs a formatted table with header in TTY mode', async () => {
    const { listCommand, mocks } = await loadListCommand({
      isTTY: true,
      workspaces: [
        { name: 'ticket-1234', branch: 'feature/x', paths: [{ repo: 'repo-a', path: '/tmp/a' }] },
      ],
    });

    await listCommand.parseAsync(['node', 'list'], { from: 'node' });

    const output = mocks.stdoutWrite.mock.calls.map((call) => call[0]).join('');

    expect(output).toContain('NAME');
    expect(output).toContain('BRANCH');
    expect(output).toContain('REPOS');
    expect(output).toContain('ticket-1234');
    expect(output).toContain('feature/x');
    expect(output).toContain('repo-a');
  });

  it('column widths adapt to the longest name and branch in TTY mode', async () => {
    const { listCommand, mocks } = await loadListCommand({
      isTTY: true,
      workspaces: [
        { name: 'ab', branch: 'main', paths: [{ repo: 'r', path: '/p' }] },
        { name: 'a-very-long-workspace-name', branch: 'feature/super-long-branch', paths: [] },
      ],
    });

    await listCommand.parseAsync(['node', 'list'], { from: 'node' });

    const lines = mocks.stdoutWrite.mock.calls.map((call) => call[0] as string);
    const header = lines[0];

    expect(header).toMatch(/^NAME\s+BRANCH\s+REPOS\n$/);
  });
});
