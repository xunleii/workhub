#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';

import { cdCommand } from './commands/cd.js';
import { completionCommand } from './commands/completion.js';
import { deleteCommand } from './commands/delete.js';
import { editCommand } from './commands/edit.js';
import { internalCompleteCommand } from './commands/internal-complete.js';
import { listCommand } from './commands/list.js';
import { newCommand } from './commands/new.js';
import { openCommand } from './commands/open.js';
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

/**
 * Extracts setup-related global overrides from the raw CLI arguments before Commander parses them.
 *
 * @param argv - Raw Node.js argument vector.
 * @returns Origins/editor overrides explicitly provided on the command line.
 */
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

/**
 * Applies setup-related CLI overrides on top of the loaded configuration.
 *
 * @param config - Mutable runtime configuration.
 * @param overrides - Overrides extracted from raw CLI arguments.
 */
function applyFlagOverrides(config: AppConfig, overrides: { origins?: string; editor?: string }): void {
  if (overrides.origins) {
    config.origins = overrides.origins;
  }

  if (overrides.editor) {
    config.editor = overrides.editor;
  }
}

/**
 * Detects whether the current invocation comes from shell-completion helpers.
 *
 * @param argv - Raw Node.js argument vector.
 * @returns `true` for hidden completion subcommands.
 */
function isInternalCompletionInvocation(argv: string[]): boolean {
  return argv.includes('__complete');
}

const program = new Command();

program
  .name('wh')
  .description('Local-first CLI for managing Git worktrees grouped into persistent workspaces')
  .version(version);

program.option('--origins <path>', 'origins directory (overrides config)');
program.option('--editor <name>', 'editor binary (overrides config)');

program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(cdCommand);
program.addCommand(openCommand);
program.addCommand(editCommand);
program.addCommand(deleteCommand);
program.addCommand(completionCommand);
program.addCommand(internalCompleteCommand);

const setupOverrides = readSetupOverrides(process.argv);
const internalCompletionInvocation = isInternalCompletionInvocation(process.argv);

if (!internalCompletionInvocation) {
  await validateGitVersion();
}

if (!internalCompletionInvocation && !(await configExists())) {
  const config = await runFirstRunSetup(setupOverrides);
  await saveConfig(config);
}

try {
  if (await configExists()) {
    const activeConfig = await loadConfig();

    applyFlagOverrides(activeConfig, setupOverrides);
    if (!internalCompletionInvocation) {
      await validateConfig(activeConfig);
    }
    setActiveConfig(activeConfig);
  }
} catch (error) {
  if (!internalCompletionInvocation) {
    printError((error as Error).message);
    exitWithCode(ExitCode.ToolError);
  }
}

await program.parseAsync(process.argv);
