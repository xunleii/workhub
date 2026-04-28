# Story 3.1: Implement Workspace Listing and Stale Path Detection

Status: ready-for-dev

## Story

As a developer,
I want to see all my workspaces and know which paths still exist on disk,
so that I can make informed decisions before opening or editing them.

## Acceptance Criteria

1. **Given** workspaces exist in `~/.config/workhub/workspaces/` **When** `listWorkspaces()` is called **Then** it returns each workspace annotated with stale path flags **And** a path is marked stale when its directory no longer exists on disk.
2. **Given** `wh open` is run without arguments in a TTY **When** the workspace selection prompt is shown **Then** each workspace entry indicates if it has stale paths (e.g. `[1 stale]`) **And** stale workspaces are still selectable (not blocked).
3. **Given** no workspaces exist **When** `wh open` is run **Then** a clear message is shown: "No workspaces found. Run `wh new` to create one." **And** the process exits with code 0.

## Tasks / Subtasks

- [ ] Task 1: Add `WorkspaceSummary` type to `src/types.ts` (AC: #1)
  - [ ] `export interface WorkspaceSummary { name: string; staleCount: number; }`

- [ ] Task 2: Implement `listWorkspaceSummaries()` in `src/core/workspace.ts` (AC: #1)
  - [ ] Call existing `listWorkspaces()` to get names
  - [ ] For each name, `loadWorkspace(name)` then check each path with `access()`
  - [ ] Count stale paths (those where `access()` throws ENOENT)
  - [ ] Return `WorkspaceSummary[]` sorted by name
  - [ ] Run path checks concurrently per workspace with `Promise.all`

- [ ] Task 3: Add `promptWorkspaceSelect(summaries: WorkspaceSummary[])` to `src/ui/prompts.ts` (AC: #2, #3)
  - [ ] Use `clack.select` to show workspace list
  - [ ] Label format: `'ticket-1234'` or `'ticket-1234 [2 stale]'` if staleCount > 0
  - [ ] Check `clack.isCancel()` and exit 1 if cancelled
  - [ ] Called by `wh open` command (Story 3.2)

- [ ] Task 4: Write unit tests in `tests/unit/core/workspace.test.ts` (AC: #1)
  - [ ] Test: stale detection marks paths that no longer exist
  - [ ] Test: non-stale paths not marked
  - [ ] Test: returns empty array when no workspaces

## Dev Notes

### Story dependencies

- Story 2.2: `listWorkspaces()`, `loadWorkspace()` already in `src/core/workspace.ts`. This story extends workspace.ts with `listWorkspaceSummaries()`.
- Story 1.1: `WorkspaceConfig` and existing types in `types.ts`. Add `WorkspaceSummary` here.

### `WorkspaceSummary` type

```typescript
export interface WorkspaceSummary {
  name: string;
  staleCount: number;
}
```

Add to `src/types.ts` alongside existing types.

### `listWorkspaceSummaries` implementation

```typescript
import { access } from 'fs/promises';
import type { WorkspaceSummary } from '../types.js';

export async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const names = await listWorkspaces();
  const summaries = await Promise.all(
    names.map(async (name) => {
      let staleCount = 0;
      try {
        const ws = await loadWorkspace(name);
        const checks = await Promise.all(
          ws.paths.map(async (p) => {
            try { await access(p.path); return false; }
            catch { return true; }
          })
        );
        staleCount = checks.filter(Boolean).length;
      } catch {
        // workspace file unreadable — treat all paths as stale
        staleCount = -1; // special value: unknown
      }
      return { name, staleCount };
    })
  );
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
```

### Stale path definition

A path is **stale** if `fs/promises.access(path)` throws with `ENOENT`. The path directory no longer exists on disk. This does not mean the workspace is invalid — it just means the worktree was removed without cleaning up the workspace config.

### `promptWorkspaceSelect` — label with stale indicator

```typescript
export async function promptWorkspaceSelect(
  summaries: WorkspaceSummary[]
): Promise<string> {
  const options = summaries.map(s => ({
    value: s.name,
    label: s.staleCount > 0
      ? `${s.name} [${s.staleCount} stale]`
      : s.name,
  }));

  const selected = await clack.select({
    message: 'Select a workspace to open:',
    options,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }
  return selected as string;
}
```

The stale indicator is informational only — stale workspaces remain selectable. The actual stale handling occurs in `wh open` (Story 3.2) when it filters stale paths before launching the editor.

### "No workspaces" message

This is handled in `wh open` (Story 3.2), not in `listWorkspaceSummaries`. The function returns an empty array; the command handles the empty case with a message and exit 0.

### Concurrent checks for performance

The nested `Promise.all` (one per workspace, one per path within the workspace) is important for performance. For a user with 10 workspaces each with 5 paths, sequential checks would be 50 sequential I/O calls vs. concurrent.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Architecture]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 3.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
