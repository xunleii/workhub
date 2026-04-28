import { Command } from 'commander';

import { renderCompletionScript, type SupportedShell } from '../core/completion.js';

/**
 * Prints shell completion scripts for supported shells.
 */
export const completionCommand = new Command('completion')
  .description('Print shell completion scripts')
  .argument('<shell>', 'target shell (bash, zsh, fish)')
  .action((shell: SupportedShell) => {
    process.stdout.write(renderCompletionScript(shell));
  });
