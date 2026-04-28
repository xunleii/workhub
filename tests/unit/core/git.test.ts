import { execSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { branchExists, createWorktree, scanOrigins } from '../../../src/core/git.js';

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

describe('git worktree helpers', () => {
  let repositoryDirectory: string;

  beforeEach(async () => {
    repositoryDirectory = await mkdtemp(join(tmpdir(), 'workhub-git-repo-'));

    execSync('git init', { cwd: repositoryDirectory, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: repositoryDirectory, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: repositoryDirectory, stdio: 'ignore' });
    await writeFile(join(repositoryDirectory, 'README.md'), 'init\n', 'utf8');
    execSync('git add README.md', { cwd: repositoryDirectory, stdio: 'ignore' });
    execSync('git -c commit.gpgsign=false commit -m "init"', { cwd: repositoryDirectory, stdio: 'ignore' });
  });

  afterEach(async () => {
    await rm(repositoryDirectory, { recursive: true, force: true });
  });

  it('branchExists returns true for an existing branch', async () => {
    execSync('git branch feature/existing', { cwd: repositoryDirectory, stdio: 'ignore' });

    await expect(branchExists(repositoryDirectory, 'feature/existing')).resolves.toBe(true);
  });

  it('createWorktree creates a worktree on disk for a new branch', async () => {
    const worktreeDirectory = join(tmpdir(), `workhub-worktree-${Date.now()}-new`);

    try {
      await createWorktree(repositoryDirectory, 'feature/new-worktree', worktreeDirectory);

      await expect(access(worktreeDirectory)).resolves.toBeUndefined();
      expect(execSync('git branch --list feature/new-worktree', { cwd: repositoryDirectory, encoding: 'utf8' }))
        .toContain('feature/new-worktree');
    } finally {
      await rm(worktreeDirectory, { recursive: true, force: true });
    }
  });

  it('createWorktree throws on non-git repo path', async () => {
    const nonGitDirectory = await mkdtemp(join(tmpdir(), 'workhub-non-git-'));
    const worktreeDirectory = join(tmpdir(), `workhub-worktree-${Date.now()}-invalid`);

    try {
      await expect(createWorktree(nonGitDirectory, 'feature/test', worktreeDirectory)).rejects.toThrow(
        `Failed to create worktree in ${nonGitDirectory}:`,
      );
    } finally {
      await rm(nonGitDirectory, { recursive: true, force: true });
      await rm(worktreeDirectory, { recursive: true, force: true });
    }
  });

  it('createWorktree throws when the target path already exists', async () => {
    const existingWorktreeDirectory = await mkdtemp(join(tmpdir(), 'workhub-existing-worktree-'));

    try {
      await expect(
        createWorktree(repositoryDirectory, 'feature/conflict', existingWorktreeDirectory),
      ).rejects.toThrow(`Worktree path already exists: ${existingWorktreeDirectory}`);
    } finally {
      await rm(existingWorktreeDirectory, { recursive: true, force: true });
    }
  });
});
