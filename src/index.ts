#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';

import { configExists, saveConfig } from './core/config.js';
import { runFirstRunSetup } from './ui/prompts.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

function readSetupOverrides(argv: string[]): { origins?: string; editor?: string } {
  const overrides: { origins?: string; editor?: string } = {};

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--origins' && argv[index + 1]) {
      overrides.origins = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument.startsWith('--origins=')) {
      overrides.origins = argument.slice('--origins='.length);
      continue;
    }

    if (argument === '--editor' && argv[index + 1]) {
      overrides.editor = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument.startsWith('--editor=')) {
      overrides.editor = argument.slice('--editor='.length);
    }
  }

  return overrides;
}

const program = new Command();

program
  .name('wh')
  .description('Local-first CLI for managing Git worktrees grouped into persistent workspaces')
  .version(version);

program.option('--origins <path>', 'origins directory (overrides config)');
program.option('--editor <name>', 'editor binary (overrides config)');

program.command('new [name]').description('Create a new workspace');
program.command('open [name]').description('Open an existing workspace');
program.command('edit <name>').description('Edit an existing workspace');
program.command('delete <name>').description('Delete a workspace and its worktrees');

if (!(await configExists())) {
  const config = await runFirstRunSetup(readSetupOverrides(process.argv));
  await saveConfig(config);
}

await program.parseAsync(process.argv);
