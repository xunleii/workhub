import { Command } from 'commander';

import { listWorkspaces, loadWorkspace } from '../core/workspace.js';
import { isTTY, printSuccess } from '../ui/output.js';

/**
 * Implements the `wh list` command.
 */
export const listCommand = new Command('list')
  .description('List all workspaces')
  .action(async () => {
    const workspaceNames = await listWorkspaces();

    if (workspaceNames.length === 0) {
      printSuccess('No workspaces found. Run `wh new` to create one.');
      return;
    }

    const workspaces = await Promise.all(workspaceNames.map((name) => loadWorkspace(name)));

    if (isTTY) {
      const nameWidth = Math.max(4, ...workspaces.map((workspace) => workspace.name.length));
      const branchWidth = Math.max(6, ...workspaces.map((workspace) => workspace.branch.length));

      process.stdout.write(`${'NAME'.padEnd(nameWidth)}  ${'BRANCH'.padEnd(branchWidth)}  REPOS\n`);

      for (const workspace of workspaces) {
        process.stdout.write(
          `${workspace.name.padEnd(nameWidth)}  ${workspace.branch.padEnd(branchWidth)}  ${workspace.paths.length}\n`,
        );
      }
    } else {
      for (const workspace of workspaces) {
        process.stdout.write(`${workspace.name}\t${workspace.branch}\t${workspace.paths.length}\n`);
      }
    }
  });
