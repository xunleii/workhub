import { statSync } from 'node:fs';

import * as clack from '@clack/prompts';

import { runSafetyChecks } from '../core/git.js';
import { ExitCode, type AppConfig } from '../types.js';
import {
  exitWithCode,
  isTTY,
  printError,
  printPreview,
  printSafetyWarning,
} from './output.js';
import type { PreviewOperation } from './output.js';
import type { OriginRepo, WorkspaceSummary } from '../types.js';

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

export async function promptWorkspaceName(): Promise<string> {
  const workspaceName = await clack.text({
    message: 'Workspace name:',
    validate: (value) => {
      const trimmedValue = value?.trim() ?? '';

      if (!trimmedValue) {
        return 'Name is required';
      }

      if (!/^[a-zA-Z0-9-]+$/.test(trimmedValue)) {
        return 'Use only letters, numbers, and hyphens';
      }

      return undefined;
    },
  });

  if (clack.isCancel(workspaceName)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  return (workspaceName as string).trim();
}

export async function promptRepoSelection(repositories: OriginRepo[]): Promise<OriginRepo[]> {
  const selectedRepositoryNames = await clack.multiselect({
    message: 'Select repositories (Space to toggle, Enter to confirm):',
    options: repositories.map((repository) => ({
      value: repository.name,
      label: repository.name,
    })),
    required: true,
  });

  if (clack.isCancel(selectedRepositoryNames)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  const selectedNames = selectedRepositoryNames as string[];

  return repositories.filter((repository) => selectedNames.includes(repository.name));
}

export async function promptBranchName(defaultBranch = ''): Promise<string> {
  const branchName = await clack.text({
    message: 'Branch name:',
    initialValue: defaultBranch,
    validate: (value) => {
      if (!(value?.trim() ?? '')) {
        return 'Branch name is required';
      }

      return undefined;
    },
  });

  if (clack.isCancel(branchName)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  return (branchName as string).trim();
}

export async function promptConfirm(message: string): Promise<void> {
  const confirmed = await clack.confirm({ message });

  if (clack.isCancel(confirmed) || !confirmed) {
    clack.cancel('Operation cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }
}

export async function runDestructiveFlow(options: {
  paths: Array<{ path: string }>;
  operations: PreviewOperation[];
  force: boolean;
}): Promise<void> {
  const results = await runSafetyChecks(options.paths);
  const hasUnsafePaths = results.some((result) => result.dirty || result.unpushed);

  if (hasUnsafePaths) {
    printSafetyWarning(results);
    exitWithCode(ExitCode.GitSafetyBlock);
  }

  printPreview(options.operations);

  if (options.force) {
    return;
  }

  if (!isTTY) {
    printError('use --force to delete non-interactively');
    exitWithCode(ExitCode.ToolError);
  }

  await promptConfirm('Proceed with the above operations?');
}

export async function promptWorkspaceSelect(summaries: WorkspaceSummary[]): Promise<string> {
  const selectedWorkspace = await clack.select({
    message: 'Select a workspace to open:',
    options: summaries.map((summary) => ({
      value: summary.name,
      label: summary.staleCount > 0 ? `${summary.name} [${summary.staleCount} stale]` : summary.name,
    })),
  });

  if (clack.isCancel(selectedWorkspace)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  return selectedWorkspace as string;
}
