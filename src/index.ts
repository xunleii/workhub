#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';

import {
  configExists,
  loadConfig,
  saveConfig,
  setActiveConfig,
  validateConfig,
} from './core/config.js';
import { validateGitVersion } from './core/git.js';
import { runFirstRunSetup } from './ui/prompts.js';
import type { AppConfig } from './types.js';
import { ExitCode } from './types.js';
import { exitWithCode, printError } from './ui/output.js';

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

function applyFlagOverrides(config: AppConfig, overrides: { origins?: string; editor?: string }): void {
  if (overrides.origins) {
    config.origins = overrides.origins;
  }

  if (overrides.editor) {
    config.editor = overrides.editor;
  }
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

await validateGitVersion();

const setupOverrides = readSetupOverrides(process.argv);

if (!(await configExists())) {
  const config = await runFirstRunSetup(setupOverrides);
  await saveConfig(config);
}

try {
  const activeConfig = await loadConfig();

  applyFlagOverrides(activeConfig, setupOverrides);
  await validateConfig(activeConfig);
  setActiveConfig(activeConfig);
} catch (error) {
  printError((error as Error).message);
  exitWithCode(ExitCode.ToolError);
}

await program.parseAsync(process.argv);
