import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('@clack/prompts');
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
});
