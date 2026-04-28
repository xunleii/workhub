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

/**
 * Validates the origins directory entered during setup.
 *
 * @param origins - Raw path entered by the user.
 * @returns An error message when invalid, otherwise `undefined`.
 */
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

/**
 * Runs the interactive first-run setup flow or uses non-interactive overrides.
 *
 * @param overrides - CLI-provided values that can bypass prompts in non-TTY mode.
 * @returns A validated application configuration object.
 */
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

  const origins = await clack.path({
    message: 'Path to your repositories root directory (origins):',
    initialValue: overrides?.origins ?? '',
    directory: true,
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

/**
 * Prompts for a workspace name and enforces naming rules.
 *
 * @returns Normalized workspace name.
 */
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

/**
 * Prompts for repositories to include in a workspace.
 *
 * @param repositories - Candidate repositories discovered in origins.
 * @returns The subset chosen by the user.
 */
export async function promptRepoSelection(repositories: OriginRepo[]): Promise<OriginRepo[]> {
  if (repositories.length === 0) {
    printError('No repositories available for selection.');
    exitWithCode(ExitCode.ToolError);
  }

  const sortedRepositories = [...repositories].sort((left, right) => {
    const leftLabel = left.name.split('/').at(-1) ?? left.name;
    const rightLabel = right.name.split('/').at(-1) ?? right.name;

    return leftLabel.localeCompare(rightLabel) || left.name.localeCompare(right.name);
  });

  const selectedRepositoryNames = await clack.multiselect({
    message: 'Select repositories (Space to toggle, Enter to confirm):',
    options: sortedRepositories.map((repository) => ({
      value: repository.name,
      label: repository.name.split('/').at(-1) ?? repository.name,
      hint: repository.name.includes('/') ? repository.name : undefined,
    })),
    required: true,
  });

  if (clack.isCancel(selectedRepositoryNames)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  const selectedNames = selectedRepositoryNames as string[];

  return sortedRepositories.filter((repository) => selectedNames.includes(repository.name));
}

/**
 * Prompts for a branch name, optionally seeding a default value.
 *
 * @param defaultBranch - Initial branch value shown to the user.
 * @returns Normalized branch name.
 */
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

/**
 * Prompts the user to confirm a destructive operation.
 *
 * @param message - Confirmation message shown in the prompt.
 */
export async function promptConfirm(message: string): Promise<void> {
  const confirmed = await clack.confirm({ message });

  if (clack.isCancel(confirmed) || !confirmed) {
    clack.cancel('Operation cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }
}

/**
 * Orchestrates the shared destructive-operation flow used by delete-like commands.
 *
 * @param options - Paths to validate, operations to preview, and force mode.
 */
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

/**
 * Prompts for a workspace from a summarized interactive list.
 *
 * @param summaries - Workspace summaries to render in the selector.
 * @returns The selected workspace name.
 */
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
