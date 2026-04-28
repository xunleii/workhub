# Story 1.2: Implement Cross-Cutting CLI Infrastructure

Status: review

## Story

As a developer using workhub in scripts and automation,
I want the tool to detect TTY mode, suppress interactive output in non-TTY environments, route errors to stderr, and return structured exit codes,
so that I can use it reliably in scripts and CI pipelines.

## Acceptance Criteria

1. **Given** workhub is run with stdout redirected to a file (non-TTY) **When** any command executes **Then** no ANSI color codes appear in the output **And** no interactive prompts are rendered **And** `process.env.NO_COLOR=1` also suppresses color in TTY mode.
2. **Given** a command succeeds **When** it exits **Then** the process exit code is `0`.
3. **Given** a user cancels a prompt with Ctrl+C or selects cancel **When** the process exits **Then** the exit code is `1`.
4. **Given** an invalid argument or missing binary is detected **When** the process exits **Then** the exit code is `2` and an error message is written to stderr (not stdout).
5. **Given** a Git safety check blocks a destructive operation **When** the process exits **Then** the exit code is `3` and the safety warning is written to stderr.
6. **Given** `src/ui/output.ts` **When** reviewed **Then** `isTTY` is defined as `Boolean(process.stdout.isTTY) && !process.env.NO_COLOR` **And** `exitWithCode(code)` calls `process.exit(code)` **And** no other file re-implements TTY detection.

## Tasks / Subtasks

- [x] Task 1: Complete `src/ui/output.ts` with all cross-cutting functions (AC: #1, #2, #3, #4, #5, #6)
  - [x] Implement `isTTY` constant (module-level, evaluated once at startup)
  - [x] Implement `exitWithCode(code: number): never`
  - [x] Implement `printError(message: string): void` — writes to `process.stderr`
  - [x] Implement `printSuccess(message: string): void` — writes to `process.stdout`
  - [x] Implement `printWarning(message: string): void` — writes to `process.stderr`
  - [x] Implement `printPreview(operations: Array<{ type: string; path: string }>): void` — formatted preview block to stdout
  - [x] Implement `printSafetyWarning(results: SafetyCheckResult[]): void` — formatted safety warning to stderr

- [x] Task 2: Write unit tests for `src/ui/output.ts` (AC: #1, #4, #5, #6)
  - [x] Test: `isTTY` is `false` when `process.env.NO_COLOR` is `'1'`
  - [x] Test: `printError` writes to stderr (spy on `process.stderr.write`)
  - [x] Test: `printSuccess` writes to stdout (spy on `process.stdout.write`)
  - [x] Test: `printPreview` formats operations correctly
  - [x] Test: `printSafetyWarning` formats safety results correctly

- [x] Task 3: Verify no other file uses `process.stdout.isTTY` directly (AC: #6)
  - [x] Grep codebase for `isTTY` usage — must only appear in `src/ui/output.ts`

## Dev Notes

### Story 1.1 dependency

Story 1.1 created `src/ui/output.ts` with basic `isTTY` and `exitWithCode` stubs. This story **completes** that file with all the functions the rest of the codebase will use. Do not re-create the file — extend it.

### Complete `src/ui/output.ts` implementation

```typescript
import type { SafetyCheckResult } from '../types.js';

// Evaluated once at module load — do not re-implement elsewhere
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

export interface PreviewOperation {
  type: 'CREATE' | 'REMOVE' | 'DELETE' | 'WRITE';
  path: string;
}

export function printPreview(operations: PreviewOperation[]): void {
  process.stdout.write('The following operations will be performed:\n');
  for (const op of operations) {
    process.stdout.write(`  [${op.type}] ${op.path}\n`);
  }
}

export function printSafetyWarning(results: SafetyCheckResult[]): void {
  const unsafe = results.filter(r => r.dirty || r.unpushed);
  if (unsafe.length === 0) return;
  process.stderr.write('Git safety check failed:\n');
  for (const r of unsafe) {
    const flags: string[] = [];
    if (r.dirty) flags.push('uncommitted changes');
    if (r.unpushed) flags.push('unpushed commits');
    process.stderr.write(`  ${r.path}  ${flags.join(', ')}\n`);
  }
  process.stderr.write('Aborting. Commit or push before retrying.\n');
}
```

### Exit code contract — enforce across all commands

| Code | Enum | When |
|---|---|---|
| 0 | `ExitCode.Success` | Nominal completion |
| 1 | `ExitCode.UserAbort` | User pressed Ctrl+C or selected cancel at any `@clack/prompts` prompt |
| 2 | `ExitCode.ToolError` | Invalid input, missing binary, file I/O failure, bad config |
| 3 | `ExitCode.GitSafetyBlock` | Dirty or unpushed worktrees blocked a destructive operation |

Import `ExitCode` from `../types.js` in command files. Use `exitWithCode(ExitCode.ToolError)` — never hardcode the number.

### Testing exit codes without process.exit

Do not call `process.exit` in tests — it terminates the Vitest runner. Test the *routing* of messages instead:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('printError', () => {
  it('writes to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    printError('something went wrong');
    expect(spy).toHaveBeenCalledWith('Error: something went wrong\n');
    spy.mockRestore();
  });
});
```

For `exitWithCode`, only test it exists and calls `process.exit` — mock `process.exit`:

```typescript
it('exitWithCode calls process.exit with the given code', () => {
  const spy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
  expect(() => exitWithCode(2)).toThrow('exit');
  expect(spy).toHaveBeenCalledWith(2);
  spy.mockRestore();
});
```

### isTTY — module-level constant, cannot be re-evaluated

Because `isTTY` is a module-level constant, tests cannot dynamically change `process.stdout.isTTY` mid-run without module re-loading. Test it by checking the definition is the correct expression — don't try to test it dynamically in unit tests. Integration-level TTY behavior is validated manually (AC #1).

### NO_COLOR test — use env var directly

```typescript
it('isTTY is false when NO_COLOR is set', () => {
  // isTTY is already evaluated at import time
  // This verifies the implementation in the source rather than runtime behavior
  const src = readFileSync('src/ui/output.ts', 'utf8');
  expect(src).toContain("!process.env.NO_COLOR");
});
```

Or simply document that manual testing covers this AC.

### PreviewOperation type

`printPreview` takes an array of `{ type, path }`. The type strings are `CREATE`, `REMOVE`, `DELETE`, `WRITE`. These are used by `wh new` (CREATE/WRITE), `wh delete` (REMOVE/DELETE), and `wh edit` (CREATE/WRITE). Export the `PreviewOperation` interface from `output.ts` so commands can use it.

### `printSafetyWarning` placement

This function lives in `src/ui/output.ts` (not `src/core/git.ts`) because it renders output. It receives `SafetyCheckResult[]` from `src/core/git.ts` and formats them for display. Import `SafetyCheckResult` from `../types.js`.

### Test file location

```
tests/unit/
  ui/
    output.test.ts   ← create this directory and file
```

The `tests/unit/ui/` directory does not exist after Story 1.1. Create it with the test file.

### Project Structure Notes

Only `src/ui/output.ts` changes in this story. No new source files. One new test file: `tests/unit/ui/output.test.ts`.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Format Patterns]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Stderr vs stdout split]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 1.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Red phase: `npm test -- --run tests/unit/ui/output.test.ts` failed before implementation because `printError`, `printSuccess`, `printWarning`, `printPreview`, and `printSafetyWarning` were not exported yet.
- Validation commands: `npm test -- --run tests/unit/ui/output.test.ts`, `npm run build`, `npm test`.
- Verified direct `process.stdout.isTTY` usage with ripgrep; only `src/ui/output.ts` contains the expression.

### Completion Notes List

- Completed `src/ui/output.ts` with stderr/stdout routing helpers, preview rendering, safety-warning rendering, and the exported `PreviewOperation` type.
- Added focused unit coverage for `src/ui/output.ts`, including `process.exit` mocking, output stream routing, preview formatting, and safety-warning formatting.
- Confirmed the TTY detection expression remains centralized in `src/ui/output.ts` and nowhere else in `src/`.

### File List

- .agents/bmad/implementation-artifacts/1-2-implement-cross-cutting-cli-infrastructure.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/ui/output.ts
- tests/unit/ui/output.test.ts

## Change Log

- 2026-04-28: Implemented the shared CLI output helpers, added unit tests for stream routing and formatting, and verified the centralized TTY detection rule.
