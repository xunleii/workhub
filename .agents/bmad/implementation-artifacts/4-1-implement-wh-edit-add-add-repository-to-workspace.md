# Story 4.1: Implement `wh edit --add` — Add Repository to Workspace

Status: ready-for-dev

## Story

As a developer mid-task,
I want to add a new repository to my existing workspace,
so that I can expand my working context without recreating everything from scratch.

## Acceptance Criteria

1. **Given** `wh edit ticket-1234 --add repo-d --branch feature/x` is run **When** the command executes **Then** a Git worktree is created for `repo-d` using branch `feature/x` **And** the new path is appended to the workspace's `paths` array **And** the workspace YAML is updated atomically.
2. **Given** the `--add` flag is used without `--branch` **When** the command runs **Then** in TTY mode, the user is prompted for a branch name **And** in non-TTY mode, an error is written to stderr: "--branch is required" and exits 2.
3. **Given** the specified repository does not exist in the origins directory **When** `wh edit --add` is run **Then** an error is written to stderr: "repository not found in origins: <repo>" **And** the process exits with code 2 without modifying the workspace.
4. **Given** the specified repository is already in the workspace **When** `wh edit --add` is run **Then** an error is shown: "repository already in workspace: <repo>" **And** the process exits with code 2.

## Tasks / Subtasks

- [ ] Task 1: Implement `addPath(name, entry)` in `src/core/workspace.ts` (AC: #1)
  - [ ] Load workspace, append entry to `paths`, call `saveWorkspace` (atomic write)

- [ ] Task 2: Implement `src/commands/edit.ts` — `--add` subflow (AC: #1–#4)
  - [ ] Define options: `--add <repo>`, `--remove <repo>`, `--branch <name>`
  - [ ] Validate workspace exists (`loadWorkspace`)
  - [ ] Validate `--add` repo is in origins scan results — if not, exit 2
  - [ ] Check repo not already in workspace — if it is, exit 2
  - [ ] If `--branch` missing and TTY: `promptBranchName()`; if non-TTY: exit 2
  - [ ] Build worktree path: same convention as `wh new` (`<repo.path>-<workspaceName>` adjacent pattern)
  - [ ] Call `createWorktree(repoPath, branch, worktreePath)`
  - [ ] Call `addPath(workspaceName, { repo: repoName, path: worktreePath })`
  - [ ] Print success message
  - [ ] Register command in `src/index.ts` replacing stub

- [ ] Task 3: Write tests in `tests/unit/commands/edit.test.ts` (AC: #2, #3, #4)
  - [ ] Test: missing `--branch` in non-TTY → exit 2
  - [ ] Test: repo not in origins → exit 2, workspace unchanged
  - [ ] Test: repo already in workspace → exit 2, workspace unchanged

## Dev Notes

### Story dependencies

- Story 2.1: `scanOrigins()` from `git.ts`
- Story 2.2: `loadWorkspace()`, `saveWorkspace()` from `workspace.ts`
- Story 2.3: `createWorktree()` from `git.ts`
- Story 1.3/1.4: `getActiveConfig()` from `config.ts`
- Story 1.2: `isTTY`, `printError`, `printSuccess`, `exitWithCode` from `output.ts`
- Story 1.3: `promptBranchName()` from `prompts.ts`

### `addPath` implementation

```typescript
export async function addPath(
  workspaceName: string,
  entry: { repo: string; path: string }
): Promise<void> {
  const workspace = await loadWorkspace(workspaceName);
  workspace.paths.push(entry);
  await saveWorkspace(workspace);
}
```

Simple: load → mutate → save (atomic via `saveWorkspace`). No separate atomic logic needed since `saveWorkspace` already handles atomicity.

### Repo lookup — scan origins and find by name

```typescript
const config = getActiveConfig();
const repos = await scanOrigins(config.origins);
const repo = repos.find(r => r.name === opts.add);
if (!repo) {
  printError(`repository not found in origins: ${opts.add}`);
  exitWithCode(ExitCode.ToolError);
}
```

### Already-in-workspace check

```typescript
const workspace = await loadWorkspace(workspaceName);
const alreadyIn = workspace.paths.some(p => p.repo === opts.add);
if (alreadyIn) {
  printError(`repository already in workspace: ${opts.add}`);
  exitWithCode(ExitCode.ToolError);
}
```

### Worktree path convention — same as `wh new`

Use the same adjacent-directory convention established in Story 2.4:

```typescript
function buildWorktreePath(repoPath: string, workspaceName: string): string {
  const repoParent = dirname(repoPath);
  const repoName = basename(repoPath);
  return join(repoParent, `${repoName}-${workspaceName}`);
}
```

Extract this helper to a shared utility or duplicate it in `edit.ts`. Do not import from `commands/new.ts` — commands don't import from other commands.

If this helper is also needed in `new.ts`, consider moving it to `src/core/workspace.ts` as `buildWorktreePath(repoPath, workspaceName)` so both commands import from core.

### No operation preview needed for `--add`

Unlike destructive operations, `wh edit --add` is additive. No preview is required per the PRD (only destructive operations need preview). Show a spinner or progress indication via `@clack/prompts` if desired, but it is not required by the ACs.

### `--add` and `--remove` can be mutually exclusive

Commander.js allows mutual exclusion with `.conflicts()` or checking in the action handler. For simplicity, check in the handler:

```typescript
if (opts.add && opts.remove) {
  printError('--add and --remove cannot be used together');
  exitWithCode(ExitCode.ToolError);
}
if (!opts.add && !opts.remove) {
  printError('use --add <repo> or --remove <repo>');
  exitWithCode(ExitCode.ToolError);
}
```

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Command → UI → Core boundary]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 4.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
