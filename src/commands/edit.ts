import { Command } from 'commander';

import { getActiveConfig } from '../core/config.js';
import { createWorktree, scanOrigins } from '../core/git.js';
import { addPath, buildWorktreePath, loadWorkspace } from '../core/workspace.js';
import { ExitCode } from '../types.js';
import { exitWithCode, isTTY, printError, printSuccess } from '../ui/output.js';
import { promptBranchName } from '../ui/prompts.js';

export const editCommand = new Command('edit')
  .description('Edit an existing workspace')
  .argument('<name>', 'workspace name')
  .option('--add <repo>', 'repository to add to the workspace')
  .option('--remove <repo>', 'repository to remove from the workspace')
  .option('--branch <name>', 'branch name for newly added worktrees')
  .action(async (workspaceName: string, options: { add?: string; remove?: string; branch?: string }) => {
    if (options.add && options.remove) {
      printError('--add and --remove cannot be used together');
      exitWithCode(ExitCode.ToolError);
    }

    if (!options.add && !options.remove) {
      printError('use --add <repo> or --remove <repo>');
      exitWithCode(ExitCode.ToolError);
    }

    if (options.remove) {
      printError('--remove is not implemented yet');
      exitWithCode(ExitCode.ToolError);
    }

    const workspace = await loadWorkspace(workspaceName).catch(() => {
      printError(`workspace not found: ${workspaceName}`);
      exitWithCode(ExitCode.ToolError);
    });
    const config = getActiveConfig();
    const repositories = await scanOrigins(config.origins);
    const repository = repositories.find((candidate) => candidate.name === options.add);

    if (!repository) {
      printError(`repository not found in origins: ${options.add}`);
      exitWithCode(ExitCode.ToolError);
    }

    if (workspace.paths.some((workspacePath) => workspacePath.repo === repository.name)) {
      printError(`repository already in workspace: ${repository.name}`);
      exitWithCode(ExitCode.ToolError);
    }

    const branchName = options.branch ?? (isTTY ? await promptBranchName(workspace.branch) : undefined);

    if (!branchName) {
      printError('--branch is required');
      exitWithCode(ExitCode.ToolError);
    }

    const worktreePath = buildWorktreePath(repository.path, workspaceName);

    try {
      await createWorktree(repository.path, branchName, worktreePath);
      await addPath(workspaceName, { repo: repository.name, path: worktreePath });
    } catch (error) {
      printError((error as Error).message);
      exitWithCode(ExitCode.ToolError);
    }

    printSuccess(`Added ${repository.name} to workspace ${workspaceName}`);
  });
