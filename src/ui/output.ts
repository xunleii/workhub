import type { SafetyCheckResult } from '../types.js';

export interface PreviewOperation {
  type: 'CREATE' | 'REMOVE' | 'DELETE' | 'WRITE';
  path: string;
}

export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

export function exitWithCode(code: number): never {
  process.exit(code);
}

export function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

export function printWarning(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

export function printSuccess(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function printPreview(operations: PreviewOperation[]): void {
  process.stdout.write('The following operations will be performed:\n');

  for (const operation of operations) {
    process.stdout.write(`  [${operation.type}] ${operation.path}\n`);
  }
}

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
