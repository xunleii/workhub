import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

import { getActiveConfig } from '../core/config.js';
import { getWorkspaceStatus } from '../core/git.js';
import {
  listWorkspaceSummaries,
  loadWorkspace,
  validateEditorBinary,
} from '../core/workspace.js';
import { ExitCode } from '../types.js';
import {
  exitWithCode,
  isTTY,
  printError,
  printWorkspaceStatus,
  printSuccess,
  printWarning,
} from '../ui/output.js';
import { promptWorkspaceSelect } from '../ui/prompts.js';

/**
 * Implements the `wh open` command.
 */
export const openCommand = new Command('open')
  .description('Open an existing workspace')
  .argument('[name]', 'workspace name')
  .option('--status', 'show workspace status')
  .action(async (nameArg: string | undefined, options: { status?: boolean }) => {
    const config = getActiveConfig();
    let workspaceName = nameArg;

    if (!workspaceName && !isTTY) {
      printError('workspace name required in non-TTY mode');
      exitWithCode(ExitCode.ToolError);
    }

    if (!workspaceName) {
      const summaries = await listWorkspaceSummaries();

      if (summaries.length === 0) {
        printSuccess('No workspaces found. Run `wh new` to create one.');
        exitWithCode(ExitCode.Success);
      }

      workspaceName = await promptWorkspaceSelect(summaries);
    }

    let workspace;
    try {
      workspace = await loadWorkspace(workspaceName);
    } catch {
      printError(`workspace not found: ${workspaceName}`);
      exitWithCode(ExitCode.ToolError);
    }

    if (options.status) {
      const statuses = await getWorkspaceStatus(workspace.paths);
      printWorkspaceStatus(statuses);
      exitWithCode(ExitCode.Success);
    }

    validateEditorBinary(config.editor);

    const validPaths: string[] = [];

    for (const workspacePath of workspace.paths) {
      try {
        await access(workspacePath.path);
        validPaths.push(workspacePath.path);
      } catch {
        printWarning(`Stale path excluded: ${workspacePath.path}`);
      }
    }

    if (validPaths.length === 0) {
      printError('No valid paths in workspace — all paths are stale.');
      exitWithCode(ExitCode.ToolError);
    }

    const editorProcess = spawn(config.editor, validPaths, {
      detached: true,
      stdio: 'ignore',
    });

    editorProcess.unref();
  });
