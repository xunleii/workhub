import { Command } from 'commander';

export const deleteCommand = new Command('delete')
  .description('Delete a workspace and its worktrees')
  .argument('<name>', 'workspace name');
