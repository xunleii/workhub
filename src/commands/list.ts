import { Command } from 'commander';

import { listWorkspaces, loadWorkspace } from '../core/workspace.js';
import { isTTY, printSuccess } from '../ui/output.js';

/**
 * Collapses a list of repository names that share the same parent path into
 * brace-expansion notation (one level only).
 *
 * Examples:
 *   ["ww/toto/aa","ww/toto/bb","ww/titi/aa"]
 *   → "ww/toto/{aa,bb}, ww/titi/aa"   (groupSep = ", ")
 *   → "ww/toto/{aa,bb},ww/titi/aa"    (groupSep = ",")
 *
 * @param repos - Ordered repository names.
 * @param groupSep - Separator between groups (", " for TTY, "," for non-TTY).
 */
export function formatRepos(repos: string[], groupSep = ', '): string {
  // Preserve insertion order of parents.
  const groups = new Map<string, string[]>();

  for (const repo of repos) {
    const lastSlash = repo.lastIndexOf('/');
    const parent = lastSlash >= 0 ? repo.slice(0, lastSlash) : '';
    const leaf = lastSlash >= 0 ? repo.slice(lastSlash + 1) : repo;

    const bucket = groups.get(parent);

    if (bucket) {
      bucket.push(leaf);
    } else {
      groups.set(parent, [leaf]);
    }
  }

  const parts: string[] = [];

  for (const [parent, leaves] of groups) {
    if (leaves.length === 1) {
      parts.push(parent ? `${parent}/${leaves[0]}` : leaves[0]);
    } else {
      const braces = `{${leaves.join(',')}}`;
      parts.push(parent ? `${parent}/${braces}` : braces);
    }
  }

  return parts.join(groupSep);
}

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
        const repos = formatRepos(workspace.paths.map((entry) => entry.repo), ', ');
        process.stdout.write(
          `${workspace.name.padEnd(nameWidth)}  ${workspace.branch.padEnd(branchWidth)}  ${repos}\n`,
        );
      }
    } else {
      for (const workspace of workspaces) {
        const repos = formatRepos(workspace.paths.map((entry) => entry.repo), ',');
        process.stdout.write(`${workspace.name}\t${workspace.branch}\t${repos}\n`);
      }
    }
  });
