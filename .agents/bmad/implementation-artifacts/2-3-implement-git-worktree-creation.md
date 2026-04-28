# Story 2.3: Implement Git Worktree Creation

Status: review

## Story

As a developer,
I want workhub to create Git worktrees for selected repositories,
so that I don't need to run `git worktree add` manually for each repository.

## Acceptance Criteria

1. **Given** a repository path, a branch name, and a target worktree path **When** `createWorktree(repoPath, branch, worktreePath)` is called **Then** the Git worktree is created at the target path using the specified branch **And** if the branch does not exist in the repository, it is created from the current HEAD.
2. **Given** the system `git` binary is version < 2.5 **When** the tool starts **Then** an error is written to stderr: "git 2.5+ required; found: <version>" **And** the process exits with code `2`.
3. **Given** the repository path is not a git repository **When** `createWorktree` is called **Then** it throws a descriptive error (caller reports to user and exits 2).
4. **Given** the target worktree path already exists **When** `createWorktree` is called **Then** it throws an error indicating the path conflict.
5. **Given** all `simple-git` usage **When** reviewing `src/core/git.ts` **Then** no `simple-git` imports exist in any other file.

## Tasks / Subtasks

- [x] Task 1: Implement `validateGitVersion()` in `src/core/git.ts` (AC: #2)
  - [x] Use `simpleGit().version()` to get the installed git version
  - [x] Parse major.minor, compare to `2.5`
  - [x] Call `printError(...)` and `exitWithCode(ExitCode.ToolError)` if version < 2.5

- [x] Task 2: Wire `validateGitVersion()` into `src/index.ts` (AC: #2)
  - [x] Call once at startup, before command dispatch
  - [x] Only run if git operations will be needed (i.e., always for this CLI)

- [x] Task 3: Implement `branchExists(repoPath, branch)` in `src/core/git.ts` (AC: #1)
  - [x] Use `simpleGit(repoPath).branch(['--list', branch])`
  - [x] Return `true` if branch is in the list

- [x] Task 4: Implement `createWorktree(repoPath, branch, worktreePath)` in `src/core/git.ts` (AC: #1, #3, #4)
  - [x] If branch does not exist: create it from HEAD with `simpleGit(repoPath).checkoutLocalBranch(branch)` then set branch back — or use `raw(['worktree', 'add', '-b', branch, worktreePath])` directly
  - [x] If branch exists: use `raw(['worktree', 'add', worktreePath, branch])`
  - [x] Throw descriptive error if `repoPath` is not a git repo (simple-git throws `GitError`)
  - [x] Throw descriptive error if `worktreePath` already exists

- [x] Task 5: Write unit tests in `tests/unit/core/git.test.ts` (AC: #1, #3, #4)
  - [x] Test `branchExists` with a real git repo in tmpdir
  - [x] Test `createWorktree` creates worktree on disk
  - [x] Test `createWorktree` throws on non-git repo path
  - [x] Test `createWorktree` creates branch if it doesn't exist

## Dev Notes

### Story dependencies

- Story 2.1 added `scanOrigins` to `src/core/git.ts`. This story adds new functions to the same file.
- `simple-git` must **only** appear in `src/core/git.ts` — no other file. (AC #5)
- `validateGitVersion` needs `printError` and `exitWithCode` from `src/ui/output.ts` — this is the only allowed cross-boundary import in core.

### `simple-git` import pattern

```typescript
import simpleGit from 'simple-git';
```

`simple-git` default export is the factory. Call `simpleGit(repoPath)` to get a `SimpleGit` instance bound to a specific repo directory. Call `simpleGit()` (no arg) for global operations like version checking.

### `validateGitVersion` implementation

```typescript
import simpleGit from 'simple-git';
import { printError, exitWithCode } from '../ui/output.js';
import { ExitCode } from '../types.js';

export async function validateGitVersion(): Promise<void> {
  const git = simpleGit();
  const version = await git.version();
  // version.major and version.minor are numbers
  const sufficient = version.major > 2 || (version.major === 2 && version.minor >= 5);
  if (!sufficient) {
    printError(`git 2.5+ required; found: ${version.major}.${version.minor}`);
    exitWithCode(ExitCode.ToolError);
  }
}
```

### `createWorktree` implementation — handle new vs existing branch

```typescript
export async function createWorktree(
  repoPath: string,
  branch: string,
  worktreePath: string
): Promise<void> {
  const git = simpleGit(repoPath);

  // Check if worktreePath already exists
  try {
    await access(worktreePath);
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // ENOENT = doesn't exist = good, proceed
  }

  const exists = await branchExists(repoPath, branch);
  if (exists) {
    // Branch exists: attach worktree to it
    await git.raw(['worktree', 'add', worktreePath, branch]);
  } else {
    // Branch doesn't exist: create it and check out in worktree
    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
  }
}
```

`git worktree add -b <branch> <path>` creates the branch from current HEAD and sets up the worktree simultaneously — this is the correct git command for new branches.

### Worktree path convention

The caller (`wh new` command, Story 2.4) determines the worktree path. The convention is:
```
<repo-path>/.git/worktrees/<branch-sanitized>
```

Or more practically:
```
<origins>/<repo>/.git/worktrees/<branch>
```

This convention is established in Story 2.4 when constructing worktree paths. `createWorktree` itself is agnostic about where the path is — it just creates at `worktreePath`.

Wait — actually the architecture workspace schema shows:
```yaml
paths:
  - repo: repo-a
    path: /path/to/repos/repo-a/.git/worktrees/feature-new-api
```

So the path is `<repo-root>/.git/worktrees/<branch>`. But actually `git worktree add` puts the worktree *outside* the repo, not inside `.git`. Let me reconsider.

The path in the schema is the **worktree checkout path**, not a path inside `.git`. The schema example `/path/to/repos/repo-a/.git/worktrees/feature-new-api` looks like it's inside `.git`, but that's actually where git stores worktree *metadata*, not the checkout.

The actual worktree path should be something the user can `cd` into. The architecture example may be misleading. A sensible convention: `<origins>/<repo-name>-<branch>/` or `<repo-path>/../<repo-name>-<branch>/`.

**Decision for Story 2.4:** The path convention is determined in Story 2.4. Story 2.3 just takes whatever `worktreePath` is given.

### Error handling — `simple-git` throws `GitError`

When `repoPath` is not a git repo, `simple-git` throws a `GitError`. Catch it and rethrow with a descriptive message:

```typescript
try {
  await git.raw(['worktree', 'add', ...]);
} catch (err) {
  if (err instanceof Error) {
    throw new Error(`Failed to create worktree in ${repoPath}: ${err.message}`);
  }
  throw err;
}
```

### Unit tests — real git repos in tmpdir

```typescript
import { execSync } from 'child_process';

async function initTestRepo(dir: string): Promise<void> {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('echo "init" > README.md && git add . && git commit -m "init"', 
    { cwd: dir, shell: '/bin/bash' });
}
```

Use `execSync` (Node built-in) for test setup — not `simple-git`. Tests should exercise `simple-git` behavior through the wrapper functions.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Git Integration]
- [Source: .agents/bmad/planning-artifacts/architecture.md#All simple-git usage in src/core/git.ts only]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 2.3]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Red phase: `npm test -- --run tests/unit/core/git.test.ts` initially failed because `branchExists` and `createWorktree` were not implemented, then the temporary test repos exposed a global Git signing configuration that had to be neutralized with `git -c commit.gpgsign=false` for fixture commits.
- Validation commands: `npm test -- --run tests/unit/core/git.test.ts`, `npm run build`, `npm test`.
- Verified with ripgrep that `simple-git` is imported only from `src/core/git.ts`.

### Completion Notes List

- Added `validateGitVersion`, `branchExists`, and `createWorktree` to `src/core/git.ts`, keeping all `simple-git` usage isolated in that one core module.
- Wired Git version validation into CLI startup so unsupported git versions fail before command dispatch.
- Extended Git integration tests to use real temporary repositories, covering existing branches, new-branch worktree creation, non-repo errors, and path conflicts.

### File List

- .agents/bmad/implementation-artifacts/2-3-implement-git-worktree-creation.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/core/git.ts
- src/index.ts
- tests/unit/core/git.test.ts

## Change Log

- 2026-04-28: Implemented Git version validation and worktree creation helpers, then validated them with real temporary git repositories.
