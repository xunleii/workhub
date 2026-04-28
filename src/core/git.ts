import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { simpleGit } from 'simple-git';

import type { OriginRepo, WorkspacePathStatus } from '../types.js';
import { ExitCode } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

export async function scanOrigins(originsPath: string): Promise<OriginRepo[]> {
  try {
    await access(originsPath);
  } catch {
    throw new Error(`Origins directory not found: ${originsPath}`);
  }

  const entries = await readdir(originsPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  const repositories = await Promise.all(
    directories.map(async (directory) => {
      const repositoryPath = join(originsPath, directory.name);
      const gitPath = join(repositoryPath, '.git');

      try {
        await access(gitPath);
        return { name: directory.name, path: repositoryPath };
      } catch {
        return null;
      }
    }),
  );

  return repositories
    .filter((repository): repository is OriginRepo => repository !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function validateGitVersion(): Promise<void> {
  const version = await simpleGit().version();
  const versionString = `${version.major}.${version.minor}`;
  const versionIsSupported = version.major > 2 || (version.major === 2 && version.minor >= 5);

  if (!versionIsSupported) {
    printError(`git 2.5+ required; found: ${versionString}`);
    exitWithCode(ExitCode.ToolError);
  }
}

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const branchSummary = await simpleGit(repoPath).branch(['--list', branch]);

  return branchSummary.all.includes(branch);
}

export async function createWorktree(
  repoPath: string,
  branch: string,
  worktreePath: string,
): Promise<void> {
  try {
    await access(worktreePath);
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const git = simpleGit(repoPath);

  try {
    if (await branchExists(repoPath, branch)) {
      await git.raw(['worktree', 'add', worktreePath, branch]);
      return;
    }

    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create worktree in ${repoPath}: ${error.message}`);
    }

    throw error;
  }
}

export async function checkDirty(repoPath: string): Promise<boolean> {
  const status = await simpleGit(repoPath).status();
  return !status.isClean();
}

export async function checkUnpushed(repoPath: string): Promise<boolean> {
  const status = await simpleGit(repoPath).status();
  return status.ahead > 0;
}

export async function getWorkspaceStatus(
  paths: Array<{ repo: string; path: string }>,
): Promise<WorkspacePathStatus[]> {
  return Promise.all(
    paths.map(async ({ repo, path }) => {
      try {
        await access(path);
      } catch {
        return {
          repo,
          path,
          exists: false,
          dirty: false,
          unpushed: false,
        };
      }

      const git = simpleGit(path);
      const status = await git.status();

      return {
        repo,
        path,
        exists: true,
        branch: status.current || undefined,
        dirty: !status.isClean(),
        unpushed: status.ahead > 0,
      };
    }),
  );
}
