#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('wh')
  .description('Local-first CLI for managing Git worktrees grouped into persistent workspaces')
  .version(version);

program.command('new [name]').description('Create a new workspace');
program.command('open [name]').description('Open an existing workspace');
program.command('edit <name>').description('Edit an existing workspace');
program.command('delete <name>').description('Delete a workspace and its worktrees');

program.parse();
