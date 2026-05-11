import { access, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import { simpleGit } from 'simple-git';

import type { OriginRepo, SafetyCheckResult, WorkspacePathStatus } from '../types.js';
import { ExitCode } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

/**
 * Recursively scans a directory tree until it finds Git repositories.
 *
 * Once a directory is detected as a repository, scanning stops below that node
 * so nested repository internals are not traversed.
 *
 * @param directoryPath - Current directory being scanned.
 * @param originsPath - Root origins directory used to compute stable names.
 * @returns Repositories discovered under the current directory.
 */
async function scanDirectoryForRepositories(
  directoryPath: string,
  originsPath: string,
): Promise<OriginRepo[]> {
  try {
    await access(join(directoryPath, '.git'));

    return [{
      name: relative(originsPath, directoryPath).split(sep).join('/'),
      path: directoryPath,
    }];
  } catch {
    // Fall through to recursive scanning when the current directory is not a repository.
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  const nestedRepositories = await Promise.all(
    directories.map(async (directory) =>
      scanDirectoryForRepositories(join(directoryPath, directory.name), originsPath)),
  );

  return nestedRepositories.flat();
}

/**
 * Scans the configured origins directory and returns discovered Git repositories.
 *
 * @param originsPath - Root directory containing local repositories.
 * @returns Sorted repository descriptors.
 * @throws {Error} When the origins directory cannot be accessed.
 */
export async function scanOrigins(originsPath: string): Promise<OriginRepo[]> {
  try {
    await access(originsPath);
  } catch {
    throw new Error(`Origins directory not found: ${originsPath}`);
  }

  return (await scanDirectoryForRepositories(originsPath, originsPath))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Resolves a repository query against scanned origins.
 *
 * Exact relative-path matches win first. When no exact match exists, the
 * repository basename is accepted only if it is unique across all scanned
 * repositories.
 *
 * @param repositories - Repositories returned by {@link scanOrigins}.
 * @param query - User-provided repository identifier.
 * @returns The resolved repository, or `null` when no match exists.
 * @throws {Error} When the basename is ambiguous.
 */
export function findOriginRepo(repositories: OriginRepo[], query: string): OriginRepo | null {
  const exactMatch = repositories.find((repository) => repository.name === query);

  if (exactMatch) {
    return exactMatch;
  }

  const basenameMatches = repositories.filter((repository) =>
    repository.name.split('/').at(-1) === query);

  if (basenameMatches.length > 1) {
    throw new Error(`repository name is ambiguous in origins: ${query}`);
  }

  return basenameMatches[0] ?? null;
}

/**
 * Ensures the installed Git version supports worktree operations required by the CLI.
 */
export async function validateGitVersion(): Promise<void> {
  const version = await simpleGit().version();
  const versionString = `${version.major}.${version.minor}`;
  const versionIsSupported = version.major > 2 || (version.major === 2 && version.minor >= 5);

  if (!versionIsSupported) {
    printError(`git 2.5+ required; found: ${versionString}`);
    exitWithCode(ExitCode.ToolError);
  }
}

/**
 * Checks whether a branch already exists in a repository.
 *
 * @param repoPath - Path to the base repository.
 * @param branch - Branch name to look up.
 * @returns `true` when the branch already exists.
 */
export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const branchSummary = await simpleGit(repoPath).branch(['--list', branch]);

  return branchSummary.all.includes(branch);
}

/**
 * Lists all local branches in a repository.
 *
 * @param repoPath - Path to the base repository.
 * @returns Local branch names.
 */
export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const branchSummary = await simpleGit(repoPath).branch();

  return branchSummary.all;
}

/**
 * Lists branches currently checked out in a worktree.
 *
 * @param repoPath - Path to the base repository.
 * @returns Branch names that are locked to an existing worktree.
 */
export async function listWorktreeBranches(repoPath: string): Promise<string[]> {
  const output = await simpleGit(repoPath).raw(['worktree', 'list', '--porcelain']);
  const branches: string[] = [];

  for (const line of output.split('\n')) {
    if (line.startsWith('branch refs/heads/')) {
      branches.push(line.slice('branch refs/heads/'.length).trim());
    }
  }

  return branches;
}

/**
 * Creates a Git worktree for the requested branch, creating the branch when needed.
 *
 * @param repoPath - Path to the base repository.
 * @param branch - Branch name to check out in the new worktree.
 * @param worktreePath - Target directory for the new worktree.
 */
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
    await mkdir(dirname(worktreePath), { recursive: true });

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

/**
 * Removes an existing Git worktree from its parent repository.
 *
 * @param repoPath - Path to the base repository.
 * @param worktreePath - Absolute path of the worktree to remove.
 */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await simpleGit(repoPath).raw(['worktree', 'remove', worktreePath]);
}

/**
 * Detects whether a repository has local uncommitted changes.
 *
 * Missing paths are treated as safe and return `false`.
 *
 * @param repoPath - Repository or worktree path to inspect.
 * @returns `true` when the worktree is dirty.
 */
export async function checkDirty(repoPath: string): Promise<boolean> {
  try {
    await access(repoPath);
  } catch {
    return false;
  }

  const status = await simpleGit(repoPath).status();
  return !status.isClean();
}

/**
 * Detects whether a repository has commits ahead of its upstream branch.
 *
 * Missing paths and repositories without an upstream are treated as safe and
 * return `false`.
 *
 * @param repoPath - Repository or worktree path to inspect.
 * @returns `true` when local commits are not yet pushed.
 */
export async function checkUnpushed(repoPath: string): Promise<boolean> {
  try {
    await access(repoPath);
  } catch {
    return false;
  }

  const git = simpleGit(repoPath);

  try {
    await git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    return false;
  }

  const log = await git.log({ from: '@{u}', to: 'HEAD' });
  return log.total > 0;
}

/**
 * Runs dirty and unpushed safety checks for every provided path.
 *
 * @param entries - Paths that will participate in a destructive operation.
 * @returns Safety results in the same order as the input entries.
 */
export async function runSafetyChecks(entries: Array<{ path: string }>): Promise<SafetyCheckResult[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [dirty, unpushed] = await Promise.all([
        checkDirty(entry.path),
        checkUnpushed(entry.path),
      ]);

      return {
        path: entry.path,
        dirty,
        unpushed,
      };
    }),
  );
}

/**
 * Collects filesystem and Git status details for workspace entries.
 *
 * @param paths - Workspace paths to inspect.
 * @returns Status information suitable for `wh open --status`.
 */
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
      const [status, dirty, unpushed] = await Promise.all([
        git.status(),
        checkDirty(path),
        checkUnpushed(path),
      ]);

      return {
        repo,
        path,
        exists: true,
        branch: status.current || undefined,
        dirty,
        unpushed,
      };
    }),
  );
}
