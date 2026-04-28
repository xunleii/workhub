# Story 4.2: Implement `wh edit --remove` — Disassociate Path from Workspace

Status: ready-for-dev

## Story

As a developer,
I want to remove a repository from my workspace without deleting the worktree from disk,
so that I can focus my workspace without losing local changes.

## Acceptance Criteria

1. **Given** `wh edit ticket-1234 --remove repo-b` is run **When** the command executes **Then** the path for `repo-b` is removed from the workspace's `paths` array **And** the worktree directory on disk is NOT deleted **And** the workspace YAML is updated atomically **And** a confirmation message is shown: "Removed repo-b from workspace. Worktree at <path> is untouched."
2. **Given** the specified repository is not in the workspace **When** `wh edit --remove` is run **Then** an error is shown: "repository not in workspace: <repo>" **And** the process exits with code 2.
3. **Given** `wh edit ticket-1234 --remove repo-b` runs in non-TTY mode **When** the command executes **Then** no confirmation prompt appears and the operation proceeds directly.

## Tasks / Subtasks

- [ ] Task 1: Implement `removePath(name, repoName)` in `src/core/workspace.ts` (AC: #1, #2)
  - [ ] Load workspace
  - [ ] Find entry by `repo` name — throw if not found
  - [ ] Remove entry from `paths` array
  - [ ] Call `saveWorkspace` atomically
  - [ ] Return the removed entry's `path` (for confirmation message)

- [ ] Task 2: Implement `--remove` subflow in `src/commands/edit.ts` (AC: #1, #2, #3)
  - [ ] Call `removePath(workspaceName, opts.remove)`
  - [ ] Print success: `"Removed ${opts.remove} from workspace. Worktree at ${removedPath} is untouched."`
  - [ ] Do NOT delete anything from disk
  - [ ] No confirmation prompt (even in TTY) — this operation is non-destructive to disk

- [ ] Task 3: Write tests in `tests/unit/commands/edit.test.ts` (AC: #1, #2, #3)
  - [ ] Test: `removePath` removes correct entry and saves
  - [ ] Test: `removePath` throws "repository not in workspace" for unknown repo
  - [ ] Test: disk worktree is NOT touched (directory still exists after `removePath`)

## Dev Notes

### Story dependencies

- Story 4.1: `src/commands/edit.ts` already implemented for `--add`. This story adds the `--remove` branch to the same command. The command file already exists.
- Story 2.2: `loadWorkspace()`, `saveWorkspace()` from `workspace.ts`.
- Story 1.2: `printSuccess`, `printError`, `exitWithCode` from `output.ts`.

### `removePath` implementation

```typescript
export async function removePath(
  workspaceName: string,
  repoName: string
): Promise<string> {
  const workspace = await loadWorkspace(workspaceName);
  const idx = workspace.paths.findIndex(p => p.repo === repoName);
  if (idx === -1) {
    throw new Error(`repository not in workspace: ${repoName}`);
  }
  const [removed] = workspace.paths.splice(idx, 1);
  await saveWorkspace(workspace);
  return removed.path;
}
```

Returns the removed path so the caller can display it in the success message.

### `--remove` does NOT touch the filesystem

This is a key distinction from `wh delete` (Story 5.3). `wh edit --remove` only modifies the workspace YAML. The worktree directory on disk is **intentionally left untouched**. No `removeWorktree()` call here.

AC #1 explicitly states: "the worktree directory on disk is NOT deleted".

### No confirmation prompt for `--remove` (AC #3)

Unlike `wh delete`, removing a path from a workspace is not destructive to the disk. The worktree is preserved. Therefore:
- No `printPreview` needed
- No `promptConfirm` needed
- No `--force` flag needed
- Proceed directly in both TTY and non-TTY modes

### Adding `--remove` to `edit.ts` (already has `--add` from Story 4.1)

The `edit.ts` action handler from Story 4.1 already has the `if (opts.add)` branch. Add the `if (opts.remove)` branch alongside it:

```typescript
// In action handler:
if (opts.remove) {
  const workspace = await loadWorkspace(workspaceName);
  const found = workspace.paths.find(p => p.repo === opts.remove);
  if (!found) {
    printError(`repository not in workspace: ${opts.remove}`);
    exitWithCode(ExitCode.ToolError);
  }

  try {
    const removedPath = await removePath(workspaceName, opts.remove);
    printSuccess(`Removed ${opts.remove} from workspace. Worktree at ${removedPath} is untouched.`);
  } catch (err) {
    printError((err as Error).message);
    exitWithCode(ExitCode.ToolError);
  }
  return;
}
```

### Test: verify disk is not touched

```typescript
it('does not delete worktree directory', async () => {
  // Setup: create workspace YAML with a path entry
  // Setup: create the "worktree" directory in tmpdir
  const worktreeDir = join(tmpDir, 'repo-b-ticket-1234');
  await mkdir(worktreeDir, { recursive: true });

  await removePath('ticket-1234', 'repo-b');

  // The directory should still exist
  await expect(access(worktreeDir)).resolves.not.toThrow();
});
```

### References

- [Source: .agents/bmad/planning-artifacts/epics.md#Story 4.2]
- [Source: .agents/bmad/planning-artifacts/prd.md#FR5]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
