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

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
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
  });

  it('exits with ToolError in non-TTY mode when origins override is missing', async () => {
    const printError = vi.fn();
    const exitWithCode = vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    });

    vi.doMock('@clack/prompts', () => ({
      intro: vi.fn(),
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
      text: vi.fn(async () => cancelToken),
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
