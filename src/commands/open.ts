import { Command } from 'commander';

export const openCommand = new Command('open')
  .description('Open an existing workspace')
  .argument('[name]', 'workspace name');
