import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  exitWithCode,
  printError,
  printPreview,
  printSafetyWarning,
  printSuccess,
  printWarning,
} from '../../../src/ui/output.js';

describe('src/ui/output', () => {
  it('keeps NO_COLOR in the isTTY definition', () => {
    const source = readFileSync(new URL('../../../src/ui/output.ts', import.meta.url), 'utf8');

    expect(source).toContain('Boolean(process.stdout.isTTY) && !process.env.NO_COLOR');
  });

  it('exitWithCode calls process.exit with the given code', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    }) as never);

    expect(() => exitWithCode(2)).toThrow('exit:2');
    expect(exitSpy).toHaveBeenCalledWith(2);

    exitSpy.mockRestore();
  });

  it('printError writes to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    printError('something went wrong');

    expect(writeSpy).toHaveBeenCalledWith('Error: something went wrong\n');
    writeSpy.mockRestore();
  });

  it('printSuccess writes to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printSuccess('all good');

    expect(writeSpy).toHaveBeenCalledWith('all good\n');
    writeSpy.mockRestore();
  });

  it('printWarning writes to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    printWarning('be careful');

    expect(writeSpy).toHaveBeenCalledWith('Warning: be careful\n');
    writeSpy.mockRestore();
  });

  it('printPreview formats operations correctly', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printPreview([
      { type: 'CREATE', path: '/tmp/worktree-a' },
      { type: 'WRITE', path: '/tmp/workspace.yaml' },
    ]);

    expect(writeSpy).toHaveBeenNthCalledWith(1, 'The following operations will be performed:\n');
    expect(writeSpy).toHaveBeenNthCalledWith(2, '  [CREATE] /tmp/worktree-a\n');
    expect(writeSpy).toHaveBeenNthCalledWith(3, '  [WRITE] /tmp/workspace.yaml\n');
    writeSpy.mockRestore();
  });

  it('printSafetyWarning formats only unsafe paths', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    printSafetyWarning([
      { path: '/tmp/clean', dirty: false, unpushed: false },
      { path: '/tmp/dirty', dirty: true, unpushed: false },
      { path: '/tmp/unpushed', dirty: false, unpushed: true },
      { path: '/tmp/both', dirty: true, unpushed: true },
    ]);

    expect(writeSpy).toHaveBeenNthCalledWith(1, 'Git safety check failed:\n');
    expect(writeSpy).toHaveBeenNthCalledWith(2, '  /tmp/dirty  uncommitted changes\n');
    expect(writeSpy).toHaveBeenNthCalledWith(3, '  /tmp/unpushed  unpushed commits\n');
    expect(writeSpy).toHaveBeenNthCalledWith(4, '  /tmp/both  uncommitted changes, unpushed commits\n');
    expect(writeSpy).toHaveBeenNthCalledWith(5, 'Aborting. Commit or push before retrying.\n');
    writeSpy.mockRestore();
  });

  it('printWorkspaceStatus renders TTY output with status indicators', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalTTY = process.stdout.isTTY;

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    vi.resetModules();

    const { printWorkspaceStatus } = await import('../../../src/ui/output.js');

    printWorkspaceStatus([
      { repo: 'repo-a', path: '/tmp/worktree-a', exists: true, branch: 'feature/x', dirty: true, unpushed: false },
      { repo: 'repo-b', path: '/tmp/worktree-b', exists: false, dirty: false, unpushed: false },
    ]);

    const output = writeSpy.mock.calls.map(([chunk]) => chunk).join('');

    expect(output).toContain('Repository  Branch      State             Path\n');
    expect(output).toContain('repo-a');
    expect(output).toContain('feature/x');
    expect(output).toContain('dirty');
    expect(output).toContain('repo-b');
    expect(output).toContain('stale');

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalTTY });
    writeSpy.mockRestore();
    vi.resetModules();
  });

  it('printWorkspaceStatus renders non-TTY output as tab-separated lines', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalTTY = process.stdout.isTTY;

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
    delete process.env.NO_COLOR;
    vi.resetModules();

    const { printWorkspaceStatus } = await import('../../../src/ui/output.js');

    printWorkspaceStatus([
      {
        repo: 'repo-a',
        path: '/tmp/worktree-a',
        exists: true,
        branch: 'feature/x',
        dirty: false,
        unpushed: true,
      },
    ]);

    expect(writeSpy).toHaveBeenCalledWith('repo-a\t/tmp/worktree-a\texists\tfeature/x\tclean\tunpushed\n');

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalTTY });
    writeSpy.mockRestore();
    vi.resetModules();
  });
});
