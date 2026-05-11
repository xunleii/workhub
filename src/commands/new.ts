import { Command } from 'commander';
import { join } from 'node:path';

import { getActiveConfig } from '../core/config.js';
import { createWorktree, findOriginRepo, listLocalBranches, listWorktreeBranches, scanOrigins } from '../core/git.js';
import {
  buildWorktreePath,
  listWorkspaces,
  openWorkspace,
  resolveWorkspacesDir,
  sanitizeWorkspaceName,
  saveWorkspace,
  validateEditorBinary,
} from '../core/workspace.js';
import { ExitCode, type OriginRepo } from '../types.js';
import {
  exitWithCode,
  isTTY,
  printError,
  printPreview,
} from '../ui/output.js';
import type { PreviewOperation } from '../ui/output.js';
import {
  promptBranchName,
  promptRepoSelection,
  promptWorkspaceName,
} from '../ui/prompts.js';

/**
 * Commander collector used for repeatable `--repo` flags.
 *
 * @param value - Newly provided repository value.
 * @param previous - Previously collected values.
 * @returns Updated array including the new value.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Resolves repository names passed on the command line against discovered origins.
 *
 * @param repositories - Available repositories discovered in origins.
 * @param names - Repository names requested by the user.
 * @returns Matching repositories in the same order as the requested names.
 */
function findSelectedRepositories(repositories: OriginRepo[], names: string[]): OriginRepo[] {
  return names.map((name) => {
    const repository = findOriginRepo(repositories, name);

    if (!repository) {
      printError(`Repository not found in origins: ${name}`);
      exitWithCode(ExitCode.ToolError);
    }

    return repository;
  });
}

/**
 * Implements the `wh new` command.
 */
export const newCommand = new Command('new')
  .description('Create a new workspace')
  .argument('[name]', 'workspace name')
  .option('--repo <name>', 'repository to include (repeatable)', collect, [])
  .option('--branch <name>', 'branch name for all worktrees')
  .option('--no-open', 'skip opening in editor')
  .action(async (nameArg: string | undefined, options: { repo: string[]; branch?: string; open: boolean }) => {
    const config = getActiveConfig();
    const existingWorkspaceNames = await listWorkspaces();
    const repositories = await scanOrigins(config.origins);

    const workspaceName = nameArg
      ?? (isTTY ? await promptWorkspaceName() : undefined);

    if (!workspaceName) {
      printError('Workspace name is required in non-TTY mode');
      exitWithCode(ExitCode.ToolError);
    }

    const sanitizedName = sanitizeWorkspaceName(workspaceName);

    if (existingWorkspaceNames.some((n) => sanitizeWorkspaceName(n) === sanitizedName)) {
      printError(`Workspace already exists: ${workspaceName}`);
      exitWithCode(ExitCode.ToolError);
    }

    if (repositories.length === 0) {
      printError(`No repositories found in origins: ${config.origins}`);
      exitWithCode(ExitCode.ToolError);
    }

    if (!isTTY && options.repo.length === 0) {
      printError('--repo is required in non-TTY mode');
      exitWithCode(ExitCode.ToolError);
    }

    if (!isTTY && !options.branch) {
      printError('--branch is required in non-TTY mode');
      exitWithCode(ExitCode.ToolError);
    }

    const selectedRepositories = options.repo.length > 0
      ? findSelectedRepositories(repositories, options.repo)
      : await promptRepoSelection(repositories);

    let availableBranches: string[] = [];

    if (isTTY && !options.branch) {
      const [localBranchArrays, worktreeBranchArrays] = await Promise.all([
        Promise.all(selectedRepositories.map((repo) => listLocalBranches(repo.path))),
        Promise.all(selectedRepositories.map((repo) => listWorktreeBranches(repo.path))),
      ]);
      const occupiedBranches = new Set(worktreeBranchArrays.flat());

      availableBranches = [...new Set(localBranchArrays.flat())]
        .filter((branch) => !occupiedBranches.has(branch))
        .sort();
    }

    const branchName = options.branch ?? (isTTY ? await promptBranchName('', availableBranches) : undefined);

    if (!branchName) {
      printError('--branch is required in non-TTY mode');
      exitWithCode(ExitCode.ToolError);
    }

    if (options.open) {
      validateEditorBinary(config.editor);
    }

    const workspacePaths = selectedRepositories.map((repository) => ({
      repo: repository.name,
      path: buildWorktreePath(repository.path, workspaceName),
    }));
    const previewOperations: PreviewOperation[] = [
      ...workspacePaths.map((workspacePath) => ({
        type: 'CREATE' as const,
        path: workspacePath.path,
      })),
      {
        type: 'WRITE' as const,
        path: join(resolveWorkspacesDir(), `${workspaceName}.yaml`),
      },
    ];

    printPreview(previewOperations);

    for (const repository of selectedRepositories) {
      const worktreePath = buildWorktreePath(repository.path, workspaceName);

      try {
        await createWorktree(repository.path, branchName, worktreePath);
      } catch (error) {
        printError(`Failed to create worktree for ${repository.name}: ${(error as Error).message}`);
        exitWithCode(ExitCode.ToolError);
      }
    }

    const workspace = {
      name: workspaceName,
      branch: branchName,
      created_at: new Date().toISOString(),
      paths: workspacePaths,
    };

    await saveWorkspace(workspace);

    if (options.open) {
      openWorkspace(workspace, config);
    }
  });
