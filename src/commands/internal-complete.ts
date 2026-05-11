import { Command } from 'commander';

import { listCompletionValues, type CompletionDataSet } from '../core/completion-data.js';

/**
 * Hidden command used by generated shell completions to fetch runtime values.
 */
export const internalCompleteCommand = new Command('__complete')
  .description('Internal completion helpers')
  .argument('<dataset>', 'completion dataset (workspaces, repos, workspace-repos, branches)')
  .argument('[workspace]', 'workspace name when completing workspace repositories')
  .action(async (dataset: CompletionDataSet, workspaceName?: string) => {
    try {
      const values = await listCompletionValues(dataset, workspaceName);

      if (values.length > 0) {
        process.stdout.write(`${values.join('\n')}\n`);
      }
    } catch {
      // Completion should degrade quietly when config or runtime data is unavailable.
    }
  });
