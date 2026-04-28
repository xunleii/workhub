# Story 2.4: Implement `wh new` — Interactive Workspace Creation

Status: review

## Story

As a developer starting work on a new task,
I want to create a named workspace through a guided interactive flow,
so that I can set up my multi-repo working context without memorizing command syntax.

## Acceptance Criteria

1. **Given** workhub is configured and runs in a TTY **When** `wh new` is run without arguments **Then** the user is prompted for: workspace name → repository selection (multi-select from origins scan) → branch name **And** a preview of all operations is shown before any filesystem action **And** if the user cancels at any prompt, the process exits with code 1 and no worktrees or workspace files are created.
2. **Given** `wh new ticket-1234 --repo repo-a --repo repo-b --branch feature/x` is run in any environment **When** all required flags are provided **Then** no interactive prompts appear **And** worktrees are created and workspace saved exactly as if the user had answered the prompts with those values.
3. **Given** worktree creation fails for one repository during `wh new` **When** the error occurs **Then** the failure is reported to the user immediately **And** no workspace YAML is written (the incomplete workspace does not silently persist) **And** the process exits with code 2.
4. **Given** a workspace name is provided that already exists **When** the name validation runs **Then** an error is shown asking the user to choose a different name or delete the existing workspace.
5. **Given** the `wh new` flow completes successfully **When** all worktrees are created and the workspace is saved **Then** the editor is launched with the workspace (Story 2.5 behavior) **And** the process exits with code 0.

## Tasks / Subtasks

- [x] Task 1: Add interactive prompts for `wh new` to `src/ui/prompts.ts` (AC: #1)
  - [x] `promptWorkspaceName(): Promise<string>` — `clack.text` with name format validation
  - [x] `promptRepoSelection(repos: OriginRepo[]): Promise<OriginRepo[]>` — `clack.multiselect` for repo picks
  - [x] `promptBranchName(defaultBranch?: string): Promise<string>` — `clack.text` with non-empty validation
  - [x] Each prompt checks `clack.isCancel()` and exits 1 if cancelled

- [x] Task 2: Implement `src/commands/new.ts` — full Commander command (AC: #1, #2, #3, #4, #5)
  - [x] Define options: `--repo <name>` (multiple), `--branch <name>`, `--no-open` (skip editor)
  - [x] Collect inputs: use flags if provided; fall back to prompts when in TTY
  - [x] If non-TTY and required flags missing: exit 2 with error on stderr
  - [x] Validate workspace name is not already in use (call `listWorkspaces()`)
  - [x] Build `worktreePath` for each repo: `<repo.path>/../<workspace-name>-<repo.name>` (adjacent to repo, not inside it)
  - [x] Show preview of operations (call `printPreview`)
  - [x] Create worktrees sequentially (or concurrently) via `createWorktree`
  - [x] On any worktree creation failure: report error, do NOT call `saveWorkspace`, exit 2
  - [x] On full success: call `saveWorkspace`, then `openWorkspace` (Story 2.5)
  - [x] Register command in `src/index.ts` replacing the stub

- [x] Task 3: Write tests in `tests/unit/commands/new.test.ts` (AC: #2, #3, #4)
  - [x] Test: flag-only invocation creates expected workspace structure
  - [x] Test: duplicate name error before any filesystem operation
  - [x] Test: worktree failure → no workspace YAML written

## Dev Notes

### Story dependencies

- Story 1.2: `isTTY`, `exitWithCode`, `printError`, `printPreview` available from `output.ts`
- Story 1.3–1.4: `getActiveConfig()` available from `config.ts`
- Story 2.1: `scanOrigins()` from `git.ts`
- Story 2.2: `saveWorkspace()`, `listWorkspaces()` from `workspace.ts`
- Story 2.3: `createWorktree()`, `validateGitVersion()` from `git.ts`
- Story 2.5 (next): `openWorkspace()` — call it at end of successful `wh new`

### Worktree path convention — established here

The path for each worktree is placed **adjacent** to the repository directory, not inside it:

```typescript
function buildWorktreePath(repoPath: string, workspaceName: string): string {
  const repoParent = dirname(repoPath);
  const repoName = basename(repoPath);
  return join(repoParent, `${repoName}-${workspaceName}`);
}
```

Example: `origins/repo-a/` → worktree at `origins/repo-a-ticket-1234/`

This is practical and avoids confusion with the repo's own `.git` directory. Persisted in `workspace.paths[].path`.

**Note:** The architecture schema example shows a different convention. Use this adjacent-dir convention — it is simpler and unambiguous for the user.

### Prompt implementations in `src/ui/prompts.ts`

```typescript
import * as clack from '@clack/prompts';
import { exitWithCode } from './output.js';
import { ExitCode } from '../types.js';
import type { OriginRepo } from '../types.js';

export async function promptWorkspaceName(): Promise<string> {
  const name = await clack.text({
    message: 'Workspace name:',
    validate: (v) => {
      if (!v.trim()) return 'Name is required';
      if (!/^[a-zA-Z0-9-]+$/.test(v.trim())) return 'Use only letters, numbers, and hyphens';
    },
  });
  if (clack.isCancel(name)) { clack.cancel('Cancelled.'); exitWithCode(ExitCode.UserAbort); }
  return (name as string).trim();
}

export async function promptRepoSelection(repos: OriginRepo[]): Promise<OriginRepo[]> {
  const selected = await clack.multiselect({
    message: 'Select repositories (Space to toggle, Enter to confirm):',
    options: repos.map(r => ({ value: r, label: r.name })),
    required: true,
  });
  if (clack.isCancel(selected)) { clack.cancel('Cancelled.'); exitWithCode(ExitCode.UserAbort); }
  return selected as OriginRepo[];
}

export async function promptBranchName(): Promise<string> {
  const branch = await clack.text({
    message: 'Branch name:',
    validate: (v) => { if (!v.trim()) return 'Branch name is required'; },
  });
  if (clack.isCancel(branch)) { clack.cancel('Cancelled.'); exitWithCode(ExitCode.UserAbort); }
  return (branch as string).trim();
}
```

### `src/commands/new.ts` — structure

```typescript
import { Command } from 'commander';
import { isTTY, printError, printPreview, exitWithCode } from '../ui/output.js';
import { promptWorkspaceName, promptRepoSelection, promptBranchName } from '../ui/prompts.js';
import { getActiveConfig } from '../core/config.js';
import { scanOrigins } from '../core/git.js';
import { createWorktree } from '../core/git.js';
import { saveWorkspace, listWorkspaces } from '../core/workspace.js';
import { openWorkspace } from '../core/workspace.js'; // Story 2.5
import { ExitCode } from '../types.js';
import { dirname, basename, join } from 'path';

export const newCommand = new Command('new')
  .description('Create a new workspace')
  .argument('[name]', 'workspace name')
  .option('--repo <name>', 'repository to include (repeatable)', collect, [])
  .option('--branch <name>', 'branch name for all worktrees')
  .option('--no-open', 'skip opening in editor')
  .action(async (nameArg: string | undefined, opts) => {
    // ... implementation
  });

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
```

### Non-TTY guard for missing flags

```typescript
if (!isTTY) {
  if (!opts.branch) { printError('--branch is required in non-TTY mode'); exitWithCode(ExitCode.ToolError); }
  if (!opts.repo || opts.repo.length === 0) { printError('--repo is required in non-TTY mode'); exitWithCode(ExitCode.ToolError); }
}
```

### Operation preview — call before any worktree creation

```typescript
const operations: PreviewOperation[] = [
  ...selectedRepos.map(r => ({ type: 'CREATE' as const, path: buildWorktreePath(r.path, workspaceName) })),
  { type: 'WRITE' as const, path: `~/.config/workhub/workspaces/${workspaceName}.yaml` },
];
printPreview(operations);
```

### Worktree creation — fail-fast, no partial workspace

```typescript
for (const repo of selectedRepos) {
  const worktreePath = buildWorktreePath(repo.path, workspaceName);
  try {
    await createWorktree(repo.path, branch, worktreePath);
  } catch (err) {
    printError(`Failed to create worktree for ${repo.name}: ${(err as Error).message}`);
    exitWithCode(ExitCode.ToolError); // exits before saveWorkspace is called
  }
}
// Only reached if ALL worktrees succeeded
await saveWorkspace({ name: workspaceName, branch, created_at: new Date().toISOString(), paths: [...] });
```

### Register in `src/index.ts` — replace stub

In `src/index.ts`, replace:
```typescript
program.command('new [name]').description('Create a new workspace');
```
with:
```typescript
import { newCommand } from './commands/new.js';
program.addCommand(newCommand);
```

Remember `.js` extension in the import.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Flag/prompt fallback contract]
- [Source: .agents/bmad/planning-artifacts/architecture.md#@clack/prompts cancel handling]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Operation preview format]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 2.4]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Validation commands: `npm test -- --run tests/unit/commands/new.test.ts`, `npm run build`, `npm test`.
- End-to-end validation: ran `node dist/index.js new ticket-1234 --repo repo-a --repo repo-b --branch feature/x` against temporary git repos and a fake editor binary, confirming adjacent worktree creation, workspace YAML persistence, preview output, and editor launch order.

### Completion Notes List

- Added the `wh new` prompt helpers in `src/ui/prompts.ts` for workspace name, repo multiselect, and branch capture with cancellation handling.
- Implemented the full `newCommand` flow in `src/commands/new.ts`, including flag/prompt fallback, duplicate-name protection, preview rendering, sequential worktree creation, fail-fast error handling, and success persistence.
- Replaced the `new` stub registration in `src/index.ts` with the real Commander command.
- Added the editor validation/open helpers in `src/core/workspace.ts` because successful `wh new` completion depends on immediate editor launch.

### File List

- .agents/bmad/implementation-artifacts/2-4-implement-wh-new-interactive-workspace-creation.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/commands/new.ts
- src/core/workspace.ts
- src/index.ts
- src/ui/prompts.ts
- tests/unit/commands/new.test.ts

## Change Log

- 2026-04-28: Implemented the `wh new` flow with prompt/flag fallback, operation preview, workspace creation persistence, and end-to-end editor launch validation.
