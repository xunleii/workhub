# Story 5.3: Implement `wh delete` — Full Workspace Removal

Status: review

## Story

As a developer who has finished a task,
I want to delete a workspace and all its worktrees in a single command,
so that I can clean up completed work without manually running `git worktree remove` for each repository.

## Acceptance Criteria

1. **Given** `wh delete ticket-1234` is run and all worktrees are clean **When** the command executes **Then** safety checks pass for all paths **And** the operation preview is shown **And** the user is prompted to confirm **And** upon confirmation, all worktrees are removed with `git worktree remove <path>` **And** the workspace YAML is deleted **And** the process exits with code 0.
2. **Given** `wh delete ticket-1234` is run and one worktree has uncommitted changes **When** safety checks run **Then** the warning is printed listing the unsafe path(s) **And** the operation is blocked and exits with code 3 **And** no worktrees or YAML files are deleted.
3. **Given** `wh delete ticket-1234 --force` is run and all worktrees are clean **When** the command executes **Then** safety checks pass, operation preview is shown, confirmation is skipped, and deletion proceeds.
4. **Given** `wh delete ticket-1234 --force` is run and one worktree has unpushed commits **When** safety checks run **Then** the operation is still blocked with code 3 (--force does not bypass safety checks).
5. **Given** the workspace does not exist **When** `wh delete ticket-1234` is run **Then** an error is written to stderr: "workspace not found: ticket-1234" **And** the process exits with code 2.
6. **Given** a worktree removal fails (e.g. git reports an error) **When** `wh delete` is mid-execution **Then** the failure is reported immediately **And** remaining worktrees and the workspace YAML are still processed (best-effort cleanup) **And** the process exits with code 2.
7. **Given** `wh delete ticket-1234` runs in non-TTY mode without `--force` **When** the confirmation step is reached **Then** an error is written to stderr: "use --force to delete non-interactively" **And** the process exits with code 2.

## Tasks / Subtasks

- [x] Task 1: Implement `removeWorktree(repoPath, worktreePath)` in `src/core/git.ts` (AC: #1, #6)
  - [x] Use `simpleGit(repoPath).raw(['worktree', 'remove', worktreePath])`
  - [x] Throw on failure (caller handles best-effort)

- [x] Task 2: Implement `src/commands/delete.ts` — full `wh delete` command (AC: #1–#7)
  - [x] Define argument `<name>` (required), option `--force`
  - [x] Load workspace — exit 2 if not found (AC #5)
  - [x] Build `PreviewOperation[]`: REMOVE per worktree path + DELETE workspace YAML
  - [x] Call `runDestructiveFlow({ paths: workspace.paths, operations, force: opts.force })`
  - [x] Execute worktree removals: for each path, call `removeWorktree(repoBasePath, worktreePath)` with error capture (best-effort — AC #6)
  - [x] Delete workspace YAML: `deleteWorkspace(name)` — even if some worktrees failed
  - [x] If any worktree removal failed: exit 2; otherwise exit 0
  - [x] Register command in `src/index.ts` replacing stub

- [x] Task 3: Write tests in `tests/unit/commands/delete.test.ts` (AC: #2, #4, #5, #6, #7)
  - [x] Test: workspace not found → exit 2, nothing deleted
  - [x] Test: dirty worktree → exit 3, nothing deleted
  - [x] Test: `--force` + unpushed → exit 3 (--force does not bypass)
  - [x] Test: successful delete with `--force` skips confirmation
  - [x] Test: non-TTY without `--force` → exit 2

## Dev Notes

### Story dependencies

- Story 2.2: `loadWorkspace()`, `deleteWorkspace()` from `workspace.ts`
- Story 5.1: `runSafetyChecks()` from `git.ts`
- Story 5.2: `runDestructiveFlow()` from `prompts.ts`; `printPreview()`, `printSafetyWarning()` from `output.ts`
- Story 1.2: `printError`, `exitWithCode` from `output.ts`
- `ExitCode` from `types.ts`

### `removeWorktree` implementation

```typescript
export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  const git = simpleGit(repoPath);
  await git.raw(['worktree', 'remove', worktreePath]);
}
```

The `repoPath` is the bare repository (not the worktree itself). Derive it from the worktree path convention established in Story 2.4.

**Deriving `repoPath` from the workspace entry:** The `WorkspaceConfig.paths` array has `{ repo, path }`. The `repo` name can be used with the configured `origins` to find the base repo:

```typescript
function getRepoPath(repoName: string, origins: string): string {
  return join(origins, repoName);
}
```

So for each workspace path entry: `removeWorktree(join(origins, entry.repo), entry.path)`.

### Best-effort cleanup for worktree removal (AC #6)

When one removal fails, continue trying the rest:

```typescript
let hasError = false;
for (const entry of workspace.paths) {
  try {
    await removeWorktree(join(config.origins, entry.repo), entry.path);
  } catch (err) {
    printError(`Failed to remove worktree at ${entry.path}: ${(err as Error).message}`);
    hasError = true;
    // continue to next — best-effort cleanup
  }
}

// Always delete the workspace YAML
try {
  await deleteWorkspace(name);
} catch (err) {
  printError(`Failed to delete workspace config: ${(err as Error).message}`);
  hasError = true;
}

exitWithCode(hasError ? ExitCode.ToolError : ExitCode.Success);
```

This ensures AC #6: even if one worktree fails, the others and the YAML are still processed.

### Build operations preview before execution

```typescript
import { resolveConfigPath } from '../core/config.js';
import { dirname, join } from 'path';

const workspacesDir = join(dirname(resolveConfigPath()), 'workspaces');
const operations: PreviewOperation[] = [
  ...workspace.paths.map(p => ({ type: 'REMOVE' as const, path: p.path })),
  { type: 'DELETE' as const, path: join(workspacesDir, `${name}.yaml`) },
];
```

### `runDestructiveFlow` call — central flow from Story 5.2

```typescript
await runDestructiveFlow({
  paths: workspace.paths,   // SafetyCheckResult[] input
  operations,
  force: opts.force ?? false,
});
// If we reach here: safety passed + user confirmed (or --force + all clean)
```

`runDestructiveFlow` handles:
- Running safety checks
- Exiting 3 if unsafe (regardless of --force)
- Showing preview
- Confirmation prompt (skipped if --force)
- Exiting 2 if non-TTY without --force

After `runDestructiveFlow` returns normally, proceed with actual deletions.

### `git worktree remove` behavior

`git worktree remove <path>` removes the worktree and cleans up its metadata in the main repo's `.git/worktrees/` directory. It requires the worktree to have no uncommitted changes. Since safety checks already verified this (exit 3 if dirty), this call should succeed for all valid paths.

For stale paths (directory no longer on disk), `git worktree remove` will fail. Handle this in the catch block — a stale path removal failure is non-critical.

Alternatively, use `git worktree prune` after all removals to clean up any stale worktree metadata.

### Command registration in `src/index.ts`

```typescript
import { deleteCommand } from './commands/delete.js';
program.addCommand(deleteCommand);
```

Replace the stub `program.command('delete <name>').description(...)` with this.

### Test isolation

Tests that call `deleteWorkspace` should work with the XDG_CONFIG_HOME override pattern established in Story 2.2 tests. Tests that call `removeWorktree` need a real git repo with a real worktree. Use `git worktree add` via `execSync` for test setup.

### Complete exit code summary for `wh delete`

| Scenario | Exit Code |
|---|---|
| Success | 0 |
| User cancelled confirmation | 1 |
| Workspace not found | 2 |
| Non-TTY without --force | 2 |
| Worktree removal failed (best-effort) | 2 |
| Dirty or unpushed worktree found | 3 |

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Destructive operation flow]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Flow (wh delete)]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 5.3]
- [Source: .agents/bmad/planning-artifacts/prd.md#FR6, FR14, FR16, FR17, FR18, FR19, FR20]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Validation commands: `npm test -- --run tests/unit/commands/delete.test.ts tests/unit/core/git.test.ts tests/unit/ui/prompts.test.ts`, `npm run build`, `npm test`.

### Completion Notes List

- Added `removeWorktree()` to the Git core and implemented `src/commands/delete.ts` with shared safety/preview flow, worktree removal, workspace YAML deletion, and best-effort cleanup semantics.
- Replaced the final CLI stub in `src/index.ts`, so all planned commands are now wired through real implementations.
- Added command-level coverage for missing workspaces, safety blocking, forced deletion, non-interactive refusal without `--force`, and partial cleanup failures.

### File List

- .agents/bmad/implementation-artifacts/5-3-implement-wh-delete-full-workspace-removal.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/commands/delete.ts
- src/core/git.ts
- src/index.ts
- tests/unit/commands/delete.test.ts

## Change Log

- 2026-04-28: Implemented `wh delete` with safety gating, preview/confirmation, and best-effort workspace cleanup.
