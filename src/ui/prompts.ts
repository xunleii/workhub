import { statSync } from 'node:fs';

import * as clack from '@clack/prompts';

import { ExitCode, type AppConfig } from '../types.js';
import { exitWithCode, isTTY, printError } from './output.js';

function validateOriginsPath(origins: string | undefined): string | undefined {
  const trimmedOrigins = origins?.trim() ?? '';

  if (!trimmedOrigins) {
    return 'Path is required';
  }

  try {
    const originsStats = statSync(trimmedOrigins);

    if (!originsStats.isDirectory()) {
      return `Directory not found: ${trimmedOrigins}`;
    }
  } catch {
    return `Directory not found: ${trimmedOrigins}`;
  }

  return undefined;
}

export async function runFirstRunSetup(overrides?: {
  origins?: string;
  editor?: string;
}): Promise<AppConfig> {
  if (!isTTY && overrides?.origins) {
    const validationMessage = validateOriginsPath(overrides.origins);

    if (validationMessage) {
      printError(validationMessage);
      exitWithCode(ExitCode.ToolError);
    }

    return {
      origins: overrides.origins.trim(),
      editor: overrides.editor?.trim() || 'zed',
    };
  }

  if (!isTTY && !overrides?.origins) {
    printError('No config found. In non-TTY mode, provide --origins and --editor flags.');
    exitWithCode(ExitCode.ToolError);
  }

  clack.intro('Welcome to workhub — local-first Git workspace manager');

  const origins = await clack.text({
    message: 'Path to your repositories root directory (origins):',
    initialValue: overrides?.origins ?? '',
    validate: validateOriginsPath,
  });

  if (clack.isCancel(origins)) {
    clack.cancel('Setup cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  const editor = await clack.text({
    message: 'Default editor command:',
    initialValue: overrides?.editor ?? 'zed',
  });

  if (clack.isCancel(editor)) {
    clack.cancel('Setup cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  clack.outro('Configuration saved. Continuing...');

  return {
    origins: (origins as string).trim(),
    editor: (editor as string).trim() || 'zed',
  };
}
