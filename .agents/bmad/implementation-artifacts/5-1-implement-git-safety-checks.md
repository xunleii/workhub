# Story 5.1: Implement Git Safety Checks

Status: review

## Story

As a developer,
I want workhub to detect uncommitted changes and unpushed commits in each worktree before any destructive operation,
so that I never accidentally destroy work that hasn't been saved or shared.

## Acceptance Criteria

1. **Given** a worktree path with uncommitted changes **When** `checkDirty(path)` is called **Then** it returns `true`.
2. **Given** a worktree path with no uncommitted changes **When** `checkDirty(path)` is called **Then** it returns `false`.
3. **Given** a worktree path with unpushed commits (commits ahead of upstream) **When** `checkUnpushed(path)` is called **Then** it returns `true`.
4. **Given** a worktree path with no upstream configured **When** `checkUnpushed(path)` is called **Then** it returns `false` (no upstream = no risk of losing remote sync).
5. **Given** a worktree path that no longer exists on disk (stale) **When** either check is called **Then** it returns `false` (non-existent paths are not checked).
6. **Given** safety checks for multiple paths **When** `runSafetyChecks(paths)` is called **Then** it returns a map of `{ path → SafetyCheckResult }` for all paths.

## Tasks / Subtasks

- [x] Task 1: Implement `checkDirty(path: string): Promise<boolean>` in `src/core/git.ts` (AC: #1, #2, #5)
  - [x] Return `false` if path does not exist (`access()` throws)
  - [x] Use `simpleGit(path).status()` and return `!status.isClean()`

- [x] Task 2: Implement `checkUnpushed(path: string): Promise<boolean>` in `src/core/git.ts` (AC: #3, #4, #5)
  - [x] Return `false` if path does not exist
  - [x] Get upstream: `git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])` — if it throws (no upstream), return `false`
  - [x] Count commits ahead: `git.log({ from: '@{u}', to: 'HEAD' })` — return `log.total > 0`

- [x] Task 3: Implement `runSafetyChecks(entries: Array<{ path: string }>): Promise<SafetyCheckResult[]>` in `src/core/git.ts` (AC: #6)
  - [x] Run `checkDirty` and `checkUnpushed` concurrently per path with `Promise.all`
  - [x] Return `SafetyCheckResult[]` (type already in `types.ts` from Story 1.1)

- [x] Task 4: Write unit tests in `tests/unit/core/git.test.ts` (AC: #1–#6)
  - [x] Test: `checkDirty` returns true for repo with staged/unstaged changes
  - [x] Test: `checkDirty` returns false for clean repo
  - [x] Test: `checkUnpushed` returns false when no upstream configured
  - [x] Test: stale path (non-existent dir) returns false for both checks

## Dev Notes

### Story dependencies

- Stories 2.3 and 3.3 already added functions to `src/core/git.ts`. This story adds `checkDirty`, `checkUnpushed`, `runSafetyChecks`.
- **Story 3.3 note:** If Story 3.3 was implemented before this story, it may have already implemented `checkDirty` and `checkUnpushed` inline. In that case, extract them here as named exports and update Story 3.3's `getWorkspaceStatus` to import them.
- `SafetyCheckResult` type is already in `src/types.ts` from Story 1.1.

### `checkDirty` implementation

```typescript
export async function checkDirty(path: string): Promise<boolean> {
  try {
    await access(path);
  } catch {
    return false; // stale path — AC #5
  }
  const git = simpleGit(path);
  const status = await git.status();
  return !status.isClean();
}
```

`status.isClean()` returns `true` when there are no staged, unstaged, or untracked changes. Returns `false` (meaning dirty) when any of these are present.

### `checkUnpushed` implementation

```typescript
export async function checkUnpushed(path: string): Promise<boolean> {
  try {
    await access(path);
  } catch {
    return false; // stale path — AC #5
  }

  const git = simpleGit(path);

  // Check if upstream is configured
  try {
    await git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    return false; // no upstream configured — AC #4
  }

  // Count commits ahead of upstream
  const log = await git.log({ from: '@{u}', to: 'HEAD' });
  return log.total > 0;
}
```

`git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])` throws when no upstream is configured — this is the correct detection mechanism.

### `runSafetyChecks` implementation

```typescript
export async function runSafetyChecks(
  entries: Array<{ repo?: string; path: string }>
): Promise<SafetyCheckResult[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [dirty, unpushed] = await Promise.all([
        checkDirty(entry.path),
        checkUnpushed(entry.path),
      ]);
      return { path: entry.path, dirty, unpushed };
    })
  );
}
```

Both checks run concurrently per path (inner `Promise.all`), and all paths run concurrently (outer `Promise.all`). For 10 paths, this is ~10 parallel checks rather than 20 sequential.

### Unit test setup — real git repos

Tests for dirty/unpushed state require a real git repo. Use `child_process.execSync` for test setup:

```typescript
// Create dirty state:
execSync('echo "change" >> README.md', { cwd: repoPath });

// Create unpushed state requires a remote — skip or mock for unit tests
// Integration test is more appropriate for unpushed detection

// Test no-upstream case (most common unit test):
// Just use a fresh repo with no remote configured — checkUnpushed returns false
```

For `checkUnpushed` with actual unpushed commits, use a bare repo as remote:

```typescript
const bareRepo = join(tmpdir(), 'bare.git');
execSync(`git init --bare ${bareRepo}`);
execSync(`git remote add origin ${bareRepo}`, { cwd: repoPath });
execSync('git push -u origin main', { cwd: repoPath });
// Now make a commit without pushing:
execSync('echo "new" >> README.md && git add . && git commit -m "unpushed"', 
  { cwd: repoPath, shell: '/bin/bash' });
// checkUnpushed(repoPath) should now return true
```

### `SafetyCheckResult` already defined

Do not redefine `SafetyCheckResult`. It was defined in `src/types.ts` during Story 1.1:

```typescript
export interface SafetyCheckResult {
  path: string;
  dirty: boolean;
  unpushed: boolean;
}
```

Just import it: `import type { SafetyCheckResult } from '../types.js';`

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Git Integration]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 5.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Validation commands: `npm test -- --run tests/unit/core/git.test.ts tests/unit/ui/output.test.ts`, `npm run build`, `npm test`.

### Completion Notes List

- Hardened `checkDirty()` and `checkUnpushed()` so stale paths and repositories without upstreams are treated as safe instead of throwing.
- Added `runSafetyChecks()` and updated workspace status inspection to reuse the extracted Git safety helpers.
- Added real-repository tests for clean, dirty, stale, no-upstream, ahead-of-upstream, and multi-path safety-check behavior.

### File List

- .agents/bmad/implementation-artifacts/5-1-implement-git-safety-checks.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/core/git.ts
- tests/unit/core/git.test.ts

## Change Log

- 2026-04-28: Implemented reusable Git safety checks for dirty and unpushed worktrees ahead of destructive flows.
