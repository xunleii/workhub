import { Command } from 'commander';

import { listWorkspaceSummaries, loadWorkspace } from '../core/workspace.js';
import { ExitCode } from '../types.js';
import { exitWithCode, isTTY, printError } from '../ui/output.js';
import { promptRepoSelect, promptWorkspaceSelect } from '../ui/prompts.js';

/**
 * Implements the `wh cd` command.
 *
 * Prints the worktree path for the requested workspace + repository to stdout
 * so a shell wrapper can `cd` into it:
 *
 *   wcd() { cd "$(wh cd "$@")" }          # bash / zsh
 *   function wcd; cd (wh cd $argv); end   # fish
 */
export const cdCommand = new Command('cd')
  .description('Print the path of a workspace repository (use with a shell wrapper: wcd)')
  .argument('[workspace]', 'workspace name')
  .argument('[repo]', 'repository name')
  .action(async (workspaceArg: string | undefined, repoArg: string | undefined) => {
    let workspaceName = workspaceArg;

    if (!workspaceName) {
      if (!isTTY) {
        printError('workspace name required in non-TTY mode');
        exitWithCode(ExitCode.ToolError);
      }

      const summaries = await listWorkspaceSummaries();

      if (summaries.length === 0) {
        printError('No workspaces found. Run `wh new` to create one.');
        exitWithCode(ExitCode.ToolError);
      }

      workspaceName = await promptWorkspaceSelect(summaries, 'Select a workspace to cd into:');
    }

    let workspace;

    try {
      workspace = await loadWorkspace(workspaceName!);
    } catch {
      printError(`workspace not found: ${workspaceName}`);
      exitWithCode(ExitCode.ToolError);
    }

    if (workspace!.paths.length === 0) {
      printError('workspace has no repositories');
      exitWithCode(ExitCode.ToolError);
    }

    let targetPath: string;

    if (repoArg) {
      const found = workspace!.paths.find((entry) => entry.repo === repoArg);

      if (!found) {
        printError(`repository not in workspace: ${repoArg}`);
        exitWithCode(ExitCode.ToolError);
      }

      targetPath = found!.path;
    } else if (workspace!.paths.length === 1) {
      targetPath = workspace!.paths[0].path;
    } else {
      if (!isTTY) {
        printError('repo name required in non-TTY mode when workspace has multiple repositories');
        exitWithCode(ExitCode.ToolError);
      }

      targetPath = await promptRepoSelect(workspace!.paths);
    }

    process.stdout.write(`${targetPath}\n`);
  });
