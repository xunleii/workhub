import { Command } from 'commander';
import { join } from 'node:path';

import { getActiveConfig } from '../core/config.js';
import { removeWorktree } from '../core/git.js';
import { deleteWorkspace, loadWorkspace, resolveWorkspacesDir } from '../core/workspace.js';
import { ExitCode } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';
import type { PreviewOperation } from '../ui/output.js';
import { runDestructiveFlow } from '../ui/prompts.js';

/**
 * Implements the `wh delete` command.
 */
export const deleteCommand = new Command('delete')
  .description('Delete a workspace and its worktrees')
  .argument('<name>', 'workspace name')
  .option('--force', 'skip confirmation if all worktrees are safe to delete')
  .action(async (workspaceName: string, options: { force?: boolean }) => {
    const workspace = await loadWorkspace(workspaceName).catch(() => {
      printError(`workspace not found: ${workspaceName}`);
      exitWithCode(ExitCode.ToolError);
    });
    const operations: PreviewOperation[] = [
      ...workspace.paths.map((workspacePath) => ({
        type: 'REMOVE' as const,
        path: workspacePath.path,
      })),
      {
        type: 'DELETE' as const,
        path: join(resolveWorkspacesDir(), `${workspaceName}.yaml`),
      },
    ];

    await runDestructiveFlow({
      paths: workspace.paths,
      operations,
      force: options.force ?? false,
    });

    const config = getActiveConfig();
    let hasError = false;

    for (const workspacePath of workspace.paths) {
      try {
        await removeWorktree(join(config.origins, workspacePath.repo), workspacePath.path);
      } catch (error) {
        printError(`Failed to remove worktree at ${workspacePath.path}: ${(error as Error).message}`);
        hasError = true;
      }
    }

    try {
      await deleteWorkspace(workspaceName);
    } catch (error) {
      printError(`Failed to delete workspace config: ${(error as Error).message}`);
      hasError = true;
    }

    exitWithCode(hasError ? ExitCode.ToolError : ExitCode.Success);
  });
