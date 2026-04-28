# Story 3.3: Implement Workspace State Display

Status: review

## Story

As a developer,
I want to inspect the state of a workspace including the Git status of each path,
so that I can assess the state of my work before opening or deleting a workspace.

## Acceptance Criteria

1. **Given** `wh open <name> --status` is run **When** the command executes **Then** each workspace path is displayed with: existence status, branch name, and dirty/unpushed indicators **And** the editor is NOT launched **And** the process exits with code 0.
2. **Given** a workspace path has uncommitted changes **When** `--status` is displayed **Then** that path is marked as "dirty" in the output.
3. **Given** a workspace path has unpushed commits **When** `--status` is displayed **Then** that path is marked as "unpushed" in the output.
4. **Given** `wh open <name> --status` runs in non-TTY **When** output is rendered **Then** output is plain text, one path per line, suitable for scripting.

## Tasks / Subtasks

- [x] Task 1: Add `getWorkspaceStatus(paths)` to `src/core/git.ts` (AC: #1, #2, #3)
  - [x] For each path: check existence, current branch, dirty state, unpushed state
  - [x] Return `WorkspacePathStatus[]`
  - [x] Run checks concurrently with `Promise.all`

- [x] Task 2: Add `WorkspacePathStatus` type to `src/types.ts` (AC: #1)
  - [x] `{ repo: string; path: string; exists: boolean; branch?: string; dirty: boolean; unpushed: boolean; }`

- [x] Task 3: Implement `printWorkspaceStatus(statuses: WorkspacePathStatus[])` in `src/ui/output.ts` (AC: #1, #4)
  - [x] TTY mode: formatted table-like output with indicators
  - [x] Non-TTY mode: one path per line, tab-separated fields

- [x] Task 4: Wire `--status` handling in `src/commands/open.ts` (AC: #1)
  - [x] `open.ts` already accepts `--status` option (added as stub in Story 3.2)
  - [x] When `--status` is set: call `getWorkspaceStatus`, call `printWorkspaceStatus`, exit 0 without launching editor

- [x] Task 5: Write tests in `tests/unit/core/git.test.ts` (AC: #2, #3)
  - [x] Test: dirty detection for path with uncommitted changes
  - [x] Test: unpushed detection for path with commits ahead of upstream
  - [x] Test: stale path (non-existent) returns exists=false

## Dev Notes

### Story dependencies

- Story 2.3: `createWorktree`, `branchExists` in `git.ts`. This story adds git status functions.
- Story 5.1 also adds `checkDirty` and `checkUnpushed` to `git.ts`. **Coordinate**: if Story 5.1 is implemented before this story, reuse those functions here. If this story is implemented first, implement `checkDirty` and `checkUnpushed` here and reuse them in Story 5.1.
- Story 1.2: `isTTY` from `output.ts`.

### `WorkspacePathStatus` type

```typescript
export interface WorkspacePathStatus {
  repo: string;
  path: string;
  exists: boolean;
  branch?: string;
  dirty: boolean;
  unpushed: boolean;
}
```

### `getWorkspaceStatus` implementation

```typescript
import simpleGit from 'simple-git';

export async function getWorkspaceStatus(
  paths: Array<{ repo: string; path: string }>
): Promise<WorkspacePathStatus[]> {
  return Promise.all(
    paths.map(async ({ repo, path }) => {
      try {
        await access(path);
      } catch {
        return { repo, path, exists: false, dirty: false, unpushed: false };
      }

      const git = simpleGit(path);
      const [status, branch, unpushed] = await Promise.all([
        git.status(),
        git.revparse(['--abbrev-ref', 'HEAD']).catch(() => undefined),
        checkUnpushed(path),
      ]);

      return {
        repo,
        path,
        exists: true,
        branch: branch?.trim(),
        dirty: !status.isClean(),
        unpushed,
      };
    })
  );
}
```

If `checkDirty` and `checkUnpushed` are already implemented (from Story 5.1), use them instead of inline logic:

```typescript
dirty: await checkDirty(path),
unpushed: await checkUnpushed(path),
```

### `printWorkspaceStatus` — TTY vs non-TTY output

```typescript
export function printWorkspaceStatus(statuses: WorkspacePathStatus[]): void {
  if (isTTY) {
    for (const s of statuses) {
      const indicators: string[] = [];
      if (!s.exists) indicators.push('STALE');
      else {
        if (s.dirty) indicators.push('dirty');
        if (s.unpushed) indicators.push('unpushed');
      }
      const branch = s.branch ? ` [${s.branch}]` : '';
      const flags = indicators.length ? `  ⚠ ${indicators.join(', ')}` : '  ✓';
      process.stdout.write(`  ${s.repo}${branch}${flags}\n`);
    }
  } else {
    // Non-TTY: tab-separated, one per line — machine-parseable
    for (const s of statuses) {
      const fields = [
        s.repo,
        s.path,
        s.exists ? 'exists' : 'stale',
        s.branch ?? '',
        s.dirty ? 'dirty' : 'clean',
        s.unpushed ? 'unpushed' : 'pushed',
      ];
      process.stdout.write(fields.join('\t') + '\n');
    }
  }
}
```

### Handling `--status` in `open.ts`

Story 3.2 added `--status` as an option stub. Complete the handler:

```typescript
.option('--status', 'show workspace git status without opening editor')

// in action handler, before editor launch:
if (opts.status) {
  const workspace = await loadWorkspace(resolvedName);
  const statuses = await getWorkspaceStatus(workspace.paths);
  printWorkspaceStatus(statuses);
  exitWithCode(ExitCode.Success);
}
```

The `--status` flag causes the command to exit after displaying status, without launching the editor (AC #1).

### Branch detection — `git rev-parse --abbrev-ref HEAD`

In a worktree, `HEAD` points to the checked-out branch. `git rev-parse --abbrev-ref HEAD` returns the branch name (e.g., `feature/new-api`). If the HEAD is detached, it returns `HEAD`. Use `.catch(() => undefined)` since this might fail for empty repos.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Git Integration]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 3.3]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Validation commands: `npm test -- --run tests/unit/core/git.test.ts tests/unit/commands/open.test.ts tests/unit/ui/output.test.ts`, `npm run build`, `npm test`.

### Completion Notes List

- Added `WorkspacePathStatus` and `getWorkspaceStatus()` to inspect each workspace path for existence, current branch, dirty changes, and ahead-of-upstream state.
- Added `printWorkspaceStatus()` with human-readable TTY output and tab-separated non-TTY output for scripting.
- Completed `wh open --status` so it displays workspace state and exits successfully without validating or launching the editor.
- Added focused coverage for git status detection, CLI status-mode wiring, and status rendering.

### File List

- .agents/bmad/implementation-artifacts/3-3-implement-workspace-state-display.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/commands/open.ts
- src/core/git.ts
- src/types.ts
- src/ui/output.ts
- tests/unit/commands/open.test.ts
- tests/unit/core/git.test.ts
- tests/unit/ui/output.test.ts

## Change Log

- 2026-04-28: Implemented workspace status inspection and `wh open --status` output for both TTY and non-TTY usage.
