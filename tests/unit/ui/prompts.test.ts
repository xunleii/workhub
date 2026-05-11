import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('@clack/prompts');
  vi.doUnmock('../../../src/core/git.js');
  vi.doUnmock('../../../src/ui/output.js');

  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('src/ui/prompts', () => {
  it('returns override values without prompts in non-TTY mode', async () => {
    const originsDirectory = await mkdtemp(join(tmpdir(), 'workhub-prompts-'));
    temporaryDirectories.push(originsDirectory);
    const clackText = vi.fn();
    const clackPath = vi.fn();

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      path: clackPath,
      text: clackText,
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: false,
      exitWithCode: vi.fn(),
      printError: vi.fn(),
    }));

    const { runFirstRunSetup } = await import('../../../src/ui/prompts.js');

    await expect(
      runFirstRunSetup({
        origins: originsDirectory,
        editor: 'zed',
      }),
    ).resolves.toEqual({
      origins: originsDirectory,
      editor: 'zed',
    });

    expect(clackText).not.toHaveBeenCalled();
    expect(clackPath).not.toHaveBeenCalled();
  });

  it('exits with ToolError in non-TTY mode when origins override is missing', async () => {
    const printError = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      path: vi.fn(),
      text: vi.fn(),
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: false,
      exitWithCode,
      printError,
    }));

    const { runFirstRunSetup } = await import('../../../src/ui/prompts.js');

    await expect(runFirstRunSetup()).rejects.toThrow('exit:2');
    expect(printError).toHaveBeenCalledWith(
      'No config found. In non-TTY mode, provide --origins and --editor flags.',
    );
    expect(exitWithCode).toHaveBeenCalledWith(2);
  });

  it('exits with UserAbort when the origins prompt is cancelled', async () => {
    const cancelToken = Symbol('cancel');
    const clackCancel = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      path: vi.fn(async () => cancelToken),
      text: vi.fn(),
      isCancel: vi.fn((value: unknown) => value === cancelToken),
      cancel: clackCancel,
      outro: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode,
      printError: vi.fn(),
    }));

    const { runFirstRunSetup } = await import('../../../src/ui/prompts.js');

    await expect(runFirstRunSetup()).rejects.toThrow('exit:1');
    expect(clackCancel).toHaveBeenCalledWith('Setup cancelled.');
    expect(exitWithCode).toHaveBeenCalledWith(1);
  });

  it('uses the clack path prompt for origins in TTY mode', async () => {
    const originsDirectory = await mkdtemp(join(tmpdir(), 'workhub-prompts-tty-'));
    temporaryDirectories.push(originsDirectory);
    const clackPath = vi.fn(async () => originsDirectory);
    const clackText = vi.fn(async () => 'zed');

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      path: clackPath,
      text: clackText,
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode: vi.fn(),
      printError: vi.fn(),
      printPreview: vi.fn(),
      printSafetyWarning: vi.fn(),
    }));

    const { runFirstRunSetup } = await import('../../../src/ui/prompts.js');

    await expect(runFirstRunSetup()).resolves.toEqual({
      origins: originsDirectory,
      editor: 'zed',
    });

    expect(clackPath).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: true,
        message: 'Path to your repositories root directory (origins):',
      }),
    );
    expect(clackText).toHaveBeenCalled();
  });

  it('sorts repository choices alphabetically by displayed name', async () => {
    const clackMultiselect = vi.fn(async () => ['group-a/api', 'group-a/web']);

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      path: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(),
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
      select: vi.fn(),
      multiselect: clackMultiselect,
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode: vi.fn(),
      printError: vi.fn(),
      printPreview: vi.fn(),
      printSafetyWarning: vi.fn(),
    }));

    const { promptRepoSelection } = await import('../../../src/ui/prompts.js');

    await expect(
      promptRepoSelection([
        { name: 'group-a/web', path: '/tmp/group-a/web' },
        { name: 'group-b/mobile', path: '/tmp/group-b/mobile' },
        { name: 'group-a/api', path: '/tmp/group-a/api' },
      ]),
    ).resolves.toEqual([
      { name: 'group-a/api', path: '/tmp/group-a/api' },
      { name: 'group-a/web', path: '/tmp/group-a/web' },
    ]);

    expect(clackMultiselect).toHaveBeenCalledWith(expect.objectContaining({
      options: [
        { value: 'group-a/api', label: 'api', hint: 'group-a/api' },
        { value: 'group-b/mobile', label: 'mobile', hint: 'group-b/mobile' },
        { value: 'group-a/web', label: 'web', hint: 'group-a/web' },
      ],
    }));
  });

  it('promptConfirm exits with UserAbort when confirmation is declined', async () => {
    const clackCancel = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(async () => false),
      isCancel: vi.fn(() => false),
      cancel: clackCancel,
      outro: vi.fn(),
      select: vi.fn(),
      multiselect: vi.fn(),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode,
      printError: vi.fn(),
      printPreview: vi.fn(),
      printSafetyWarning: vi.fn(),
    }));

    const { promptConfirm } = await import('../../../src/ui/prompts.js');

    await expect(promptConfirm('Proceed?')).rejects.toThrow('exit:1');
    expect(clackCancel).toHaveBeenCalledWith('Operation cancelled.');
    expect(exitWithCode).toHaveBeenCalledWith(1);
  });

  it('runDestructiveFlow blocks unsafe paths even with --force', async () => {
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const printPreview = vi.fn();
    const printSafetyWarning = vi.fn();
    const runSafetyChecks = vi.fn(async () => [
      { path: '/tmp/worktree-a', dirty: true, unpushed: false },
    ]);

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(),
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
      select: vi.fn(),
      multiselect: vi.fn(),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks,
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode,
      printError: vi.fn(),
      printPreview,
      printSafetyWarning,
    }));

    const { runDestructiveFlow } = await import('../../../src/ui/prompts.js');

    await expect(
      runDestructiveFlow({
        paths: [{ path: '/tmp/worktree-a' }],
        operations: [{ type: 'DELETE', path: '/tmp/workspace.yaml' }],
        force: true,
      }),
    ).rejects.toThrow('exit:3');

    expect(runSafetyChecks).toHaveBeenCalledWith([{ path: '/tmp/worktree-a' }]);
    expect(printSafetyWarning).toHaveBeenCalledWith([
      { path: '/tmp/worktree-a', dirty: true, unpushed: false },
    ]);
    expect(printPreview).not.toHaveBeenCalled();
    expect(exitWithCode).toHaveBeenCalledWith(3);
  });

  it('runDestructiveFlow skips confirmation when forced and paths are safe', async () => {
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });
    const printPreview = vi.fn();
    const confirm = vi.fn();

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      text: vi.fn(),
      confirm,
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
      select: vi.fn(),
      multiselect: vi.fn(),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks: vi.fn(async () => [
        { path: '/tmp/worktree-a', dirty: false, unpushed: false },
      ]),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode,
      printError: vi.fn(),
      printPreview,
      printSafetyWarning: vi.fn(),
    }));

    const { runDestructiveFlow } = await import('../../../src/ui/prompts.js');

    await expect(
      runDestructiveFlow({
        paths: [{ path: '/tmp/worktree-a' }],
        operations: [{ type: 'DELETE', path: '/tmp/workspace.yaml' }],
        force: true,
      }),
    ).resolves.toBeUndefined();

    expect(printPreview).toHaveBeenCalledWith([{ type: 'DELETE', path: '/tmp/workspace.yaml' }]);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('promptBranchName', () => {
  function mockClack(overrides: Record<string, unknown> = {}) {
    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
      text: vi.fn(async () => 'typed-branch'),
      select: vi.fn(),
      confirm: vi.fn(),
      isCancel: vi.fn(() => false),
      cancel: vi.fn(),
      outro: vi.fn(),
      multiselect: vi.fn(),
      ...overrides,
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      runSafetyChecks: vi.fn(),
    }));

    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode: vi.fn((code: number) => { throw new Error(`exit:${code}`); }),
      printError: vi.fn(),
      printPreview: vi.fn(),
      printSafetyWarning: vi.fn(),
    }));
  }

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses text input when no available branches are provided', async () => {
    const clackText = vi.fn(async () => 'new-feature');
    const clackSelect = vi.fn();
    mockClack({ text: clackText, select: clackSelect });

    const { promptBranchName } = await import('../../../src/ui/prompts.js');

    await expect(promptBranchName()).resolves.toBe('new-feature');
    expect(clackSelect).not.toHaveBeenCalled();
    expect(clackText).toHaveBeenCalledOnce();
  });

  it('shows select when available branches are provided and returns chosen branch', async () => {
    const clackSelect = vi.fn(async () => 'feature/existing');
    const clackText = vi.fn();
    mockClack({ select: clackSelect, text: clackText });

    const { promptBranchName } = await import('../../../src/ui/prompts.js');

    await expect(promptBranchName('', ['feature/existing', 'fix/old'])).resolves.toBe('feature/existing');
    expect(clackSelect).toHaveBeenCalledOnce();
    expect(clackText).not.toHaveBeenCalled();
  });

  it('falls back to text input when "New branch..." sentinel is selected', async () => {
    const clackSelect = vi.fn(async () => '__workhub:new');
    const clackText = vi.fn(async () => 'brand-new');
    mockClack({ select: clackSelect, text: clackText });

    const { promptBranchName } = await import('../../../src/ui/prompts.js');

    await expect(promptBranchName('', ['feature/existing'])).resolves.toBe('brand-new');
    expect(clackSelect).toHaveBeenCalledOnce();
    expect(clackText).toHaveBeenCalledOnce();
  });

  it('exits with UserAbort when the select is cancelled', async () => {
    const cancelToken = Symbol('cancel');
    const clackCancel = vi.fn();
    const exitWithCode = vi.fn((code: number) => { throw new Error(`exit:${code}`); });
    vi.doMock('@clack/prompts', () => ({
      select: vi.fn(async () => cancelToken),
      text: vi.fn(),
      isCancel: vi.fn((value: unknown) => value === cancelToken),
      cancel: clackCancel,
    }));
    vi.doMock('../../../src/core/git.js', () => ({ runSafetyChecks: vi.fn() }));
    vi.doMock('../../../src/ui/output.js', () => ({
      isTTY: true,
      exitWithCode,
      printError: vi.fn(),
    }));

    const { promptBranchName } = await import('../../../src/ui/prompts.js');

    await expect(promptBranchName('', ['feature/x'])).rejects.toThrow('exit:1');
    expect(clackCancel).toHaveBeenCalledWith('Cancelled.');
  });
});
