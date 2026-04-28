import { Command } from 'commander';

export const newCommand = new Command('new')
  .description('Create a new workspace')
  .argument('[name]', 'workspace name');
