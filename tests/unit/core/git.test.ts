import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanOrigins } from '../../../src/core/git.js';

describe('scanOrigins', () => {
  let originsDirectory: string;

  beforeEach(async () => {
    originsDirectory = await mkdtemp(join(tmpdir(), 'workhub-origins-'));

    await mkdir(join(originsDirectory, 'repo-b', '.git'), { recursive: true });
    await mkdir(join(originsDirectory, 'repo-a', '.git'), { recursive: true });
    await mkdir(join(originsDirectory, 'not-a-repo'), { recursive: true });
    await mkdir(join(originsDirectory, 'worktree-repo'), { recursive: true });
    await writeFile(join(originsDirectory, 'worktree-repo', '.git'), 'gitdir: /tmp/worktree', 'utf8');
  });

  afterEach(async () => {
    await rm(originsDirectory, { recursive: true, force: true });
  });

  it('returns repos from a real tmpdir sorted by name', async () => {
    await expect(scanOrigins(originsDirectory)).resolves.toEqual([
      { name: 'repo-a', path: join(originsDirectory, 'repo-a') },
      { name: 'repo-b', path: join(originsDirectory, 'repo-b') },
      { name: 'worktree-repo', path: join(originsDirectory, 'worktree-repo') },
    ]);
  });

  it('excludes non-git directories', async () => {
    const repositories = await scanOrigins(originsDirectory);

    expect(repositories.find((repository) => repository.name === 'not-a-repo')).toBeUndefined();
  });

  it('throws on non-existent origins path', async () => {
    await expect(scanOrigins(join(originsDirectory, 'missing'))).rejects.toThrow(
      `Origins directory not found: ${join(originsDirectory, 'missing')}`,
    );
  });

  it('returns empty array for an empty origins directory', async () => {
    const emptyOriginsDirectory = await mkdtemp(join(tmpdir(), 'workhub-empty-origins-'));

    try {
      await expect(scanOrigins(emptyOriginsDirectory)).resolves.toEqual([]);
    } finally {
      await rm(emptyOriginsDirectory, { recursive: true, force: true });
    }
  });
});
