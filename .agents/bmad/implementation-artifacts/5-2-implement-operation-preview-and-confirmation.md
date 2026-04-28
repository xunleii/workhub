# Story 5.2: Implement Operation Preview and Confirmation

Status: ready-for-dev

## Story

As a developer,
I want to see a formatted list of exactly what workhub will do before it does it and explicitly confirm the operation,
so that I have full control over every destructive action.

## Acceptance Criteria

1. **Given** a set of planned operations (REMOVE worktrees + DELETE workspace YAML) **When** `printPreview(operations)` is called **Then** each operation is printed in the format `[TYPE] /path`.
2. **Given** a safety check result with at least one dirty or unpushed path **When** `printSafetyWarning(results)` is called **Then** each affected path is listed with its status **And** the output instructs the user to commit or push before retrying.
3. **Given** `--force` is passed and all paths are clean (no dirty, no unpushed) **When** the confirmation step is reached **Then** the confirmation prompt is skipped and execution proceeds.
4. **Given** `--force` is passed but one or more paths are dirty or have unpushed commits **When** the safety check runs **Then** the operation is blocked with exit code 3 regardless of `--force` **And** a warning is printed listing the unsafe paths.
5. **Given** the user is prompted for confirmation without `--force` **When** the user types anything other than the explicit confirmation value **Then** the operation is cancelled and the process exits with code 1.

## Tasks / Subtasks

- [ ] Task 1: Verify `printPreview` and `printSafetyWarning` in `src/ui/output.ts` (AC: #1, #2)
  - [ ] Story 1.2 should have implemented these — confirm they are correct and complete
  - [ ] If missing or incorrect, complete them now: `printPreview(PreviewOperation[])` and `printSafetyWarning(SafetyCheckResult[])`

- [ ] Task 2: Implement `promptConfirm(message: string): Promise<void>` in `src/ui/prompts.ts` (AC: #5)
  - [ ] Use `clack.confirm({ message })` or `clack.text` asking for explicit confirmation
  - [ ] If `clack.isCancel()` or user declines: call `clack.cancel()` and exit 1

- [ ] Task 3: Implement `runDestructiveFlow` helper in `src/ui/prompts.ts` (or inline in delete.ts) (AC: #3, #4, #5)
  - [ ] Accept: `paths[]`, `operations[]`, `force: boolean`
  - [ ] Run `runSafetyChecks(paths)`
  - [ ] If any unsafe: `printSafetyWarning(results)` + `exitWithCode(ExitCode.GitSafetyBlock)` regardless of `--force`
  - [ ] `printPreview(operations)`
  - [ ] If `force` and all clean: skip confirmation prompt
  - [ ] If not `force` or TTY: `promptConfirm(...)` — exit 1 if declined
  - [ ] If non-TTY and not `force`: error "use --force to delete non-interactively", exit 2

- [ ] Task 4: Write tests in `tests/unit/ui/output.test.ts` and `tests/unit/ui/prompts.test.ts` (AC: #1, #2, #4)
  - [ ] Test: `printPreview` outputs all operations in correct format
  - [ ] Test: `printSafetyWarning` lists dirty and unpushed paths
  - [ ] Test: `--force` does not bypass safety block (unsafe paths → exit 3)

## Dev Notes

### Story dependencies

- Story 1.2: `printPreview`, `printSafetyWarning`, `isTTY`, `exitWithCode` in `output.ts`. Verify completeness.
- Story 5.1: `runSafetyChecks()` from `git.ts`.
- `ExitCode.GitSafetyBlock = 3` from `types.ts`.

### `promptConfirm` implementation

Use `clack.confirm` for a yes/no prompt:

```typescript
export async function promptConfirm(message: string): Promise<void> {
  const confirmed = await clack.confirm({ message });
  if (clack.isCancel(confirmed) || !confirmed) {
    clack.cancel('Operation cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }
}
```

If the user presses `n` (confirms = false) or Ctrl+C (cancels), exit with code 1.

### `runDestructiveFlow` — the canonical destructive operation flow

This encapsulates the flow from the architecture document:

```typescript
export async function runDestructiveFlow(options: {
  paths: Array<{ path: string }>;
  operations: PreviewOperation[];
  force: boolean;
}): Promise<void> {
  const { paths, operations, force } = options;

  // 1. Safety checks — always run, --force does NOT bypass
  const results = await runSafetyChecks(paths);
  const hasUnsafe = results.some(r => r.dirty || r.unpushed);

  if (hasUnsafe) {
    printSafetyWarning(results);
    exitWithCode(ExitCode.GitSafetyBlock); // exit 3 — AC #4
  }

  // 2. Operation preview — always shown
  printPreview(operations);

  // 3. Confirmation
  if (force) {
    // All paths are clean — skip prompt (AC #3)
    return;
  }

  if (!isTTY) {
    // Non-TTY without --force — cannot interactively confirm
    printError('use --force to delete non-interactively');
    exitWithCode(ExitCode.ToolError);
  }

  await promptConfirm('Proceed with the above operations?');
  // Returns normally if confirmed, exits 1 if declined
}
```

### `--force` semantics — critical correctness

**`--force` ONLY skips the confirmation prompt. It NEVER bypasses safety checks.**

From the PRD (FR20): "Developer can bypass the interactive confirmation prompt via an explicit flag, provided no dirty or unpushed state is detected."

From epics Story 5.2 AC #4: "the operation is blocked with exit code 3 regardless of `--force`"

This means:
- `--force` + all clean → skip prompt, proceed
- `--force` + any dirty/unpushed → exit 3 (safety block)
- No `--force` + all clean + TTY → prompt for confirmation
- No `--force` + non-TTY → exit 2 (cannot confirm interactively)

### `printPreview` format — verify from Story 1.2

The format must match exactly:
```
The following operations will be performed:
  [REMOVE] /path/to/repo-a-ticket-1234
  [REMOVE] /path/to/repo-b-ticket-1234
  [DELETE] /Users/user/.config/workhub/workspaces/ticket-1234.yaml
```

### `printSafetyWarning` format — verify from Story 1.2

```
Git safety check failed:
  repo-a  uncommitted changes
  repo-b  unpushed commits
Aborting. Commit or push before retrying.
```

### Decision: export `runDestructiveFlow` from `prompts.ts` or keep inline?

Since `runDestructiveFlow` orchestrates between `output.ts` functions and `git.ts` functions, it logically belongs in `prompts.ts` (UI layer). It's the UI's job to coordinate the user-facing destructive flow. `wh delete` (Story 5.3) calls `runDestructiveFlow` — it doesn't need to know about the individual steps.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Destructive operation flow]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Git safety warning format]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Operation preview format]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 5.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
