import { Command } from 'commander';

export const editCommand = new Command('edit')
  .description('Edit an existing workspace')
  .argument('<name>', 'workspace name');
