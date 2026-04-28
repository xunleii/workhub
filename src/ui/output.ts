import type { SafetyCheckResult, WorkspacePathStatus } from '../types.js';

/**
 * Preview entry shown before workhub performs a filesystem or Git operation.
 */
export interface PreviewOperation {
  type: 'CREATE' | 'REMOVE' | 'DELETE' | 'WRITE';
  path: string;
}

/**
 * Indicates whether the current stdout supports interactive TTY rendering.
 */
export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/**
 * Terminates the process with the provided exit code.
 *
 * @param code - Exit code to forward to Node.js.
 */
export function exitWithCode(code: number): never {
  process.exit(code);
}

/**
 * Prints an error message to stderr using the CLI's common prefix.
 *
 * @param message - Human-readable error to display.
 */
export function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

/**
 * Prints a warning message to stderr using the CLI's common prefix.
 *
 * @param message - Human-readable warning to display.
 */
export function printWarning(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

/**
 * Prints a success/info message to stdout.
 *
 * @param message - Message to display.
 */
export function printSuccess(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Renders a destructive-operation preview before execution.
 *
 * @param operations - Ordered operations that will be performed.
 */
export function printPreview(operations: PreviewOperation[]): void {
  process.stdout.write('The following operations will be performed:\n');

  for (const operation of operations) {
    process.stdout.write(`  [${operation.type}] ${operation.path}\n`);
  }
}

/**
 * Prints workspace status in either human-readable or script-friendly form.
 *
 * @param statuses - Status rows to render.
 */
export function printWorkspaceStatus(statuses: WorkspacePathStatus[]): void {
  if (isTTY) {
    process.stdout.write('Repository  Branch      State             Path\n');

    for (const status of statuses) {
      const branch = status.branch ?? '-';
      const state = !status.exists
        ? 'stale'
        : [status.dirty ? 'dirty' : null, status.unpushed ? 'unpushed' : null]
            .filter((value): value is string => value !== null)
            .join(', ') || 'clean';

      process.stdout.write(
        `${status.repo.padEnd(10)}  ${branch.padEnd(10)}  ${state.padEnd(16)}  ${status.path}\n`,
      );
    }

    return;
  }

  for (const status of statuses) {
    const fields = [
      status.repo,
      status.path,
      status.exists ? 'exists' : 'stale',
      status.branch ?? '',
      status.dirty ? 'dirty' : 'clean',
      status.unpushed ? 'unpushed' : 'pushed',
    ];

    process.stdout.write(fields.join('\t') + '\n');
  }
}

/**
 * Prints a warning for every path blocked by Git safety checks.
 *
 * @param results - Safety-check results to render.
 */
export function printSafetyWarning(results: SafetyCheckResult[]): void {
  const unsafeResults = results.filter((result) => result.dirty || result.unpushed);

  if (unsafeResults.length === 0) {
    return;
  }

  process.stderr.write('Git safety check failed:\n');

  for (const result of unsafeResults) {
    const flags: string[] = [];

    if (result.dirty) {
      flags.push('uncommitted changes');
    }

    if (result.unpushed) {
      flags.push('unpushed commits');
    }

    process.stderr.write(`  ${result.path}  ${flags.join(', ')}\n`);
  }

  process.stderr.write('Aborting. Commit or push before retrying.\n');
}
