# Story 2.5: Implement Editor Launch

Status: review

## Story

As a developer,
I want workhub to open my new workspace in the configured editor immediately after creation,
so that I can start working without any additional steps.

## Acceptance Criteria

1. **Given** a workspace with paths `["/a/worktrees/feat", "/b/worktrees/feat"]` **When** `openWorkspace(workspace)` is called **Then** the configured editor is launched as: `<editor> /a/worktrees/feat /b/worktrees/feat` **And** paths are passed in the order they are stored in the workspace definition.
2. **Given** the configured editor binary (e.g. `zed`) is not found in `PATH` **When** any command attempts to launch the editor **Then** an error is written to stderr: "editor not found in PATH: zed" **And** the process exits with code 2 before any worktree creation or modification occurs.
3. **Given** the editor is successfully launched **When** `wh new` completes **Then** the process exits with code 0 **And** the editor process is not waited on (fire-and-forget, editor runs independently).

## Tasks / Subtasks

- [x] Task 1: Implement `validateEditorBinary(editor: string)` in `src/core/workspace.ts` (AC: #2)
  - [x] Use Node.js `child_process.spawnSync('which', [editor])` (or equivalent) to check if binary is in PATH
  - [x] On failure: call `printError(`editor not found in PATH: ${editor}`)` and `exitWithCode(ExitCode.ToolError)`
  - [x] Call this function at the start of `wh new` (before worktree creation) and at the start of `wh open`

- [x] Task 2: Implement `openWorkspace(workspace: WorkspaceConfig, config: AppConfig)` in `src/core/workspace.ts` (AC: #1, #3)
  - [x] Extract valid paths from `workspace.paths.map(p => p.path)` in persistence order
  - [x] Launch editor with `child_process.spawn(config.editor, paths, { detached: true, stdio: 'ignore' })`
  - [x] Call `editorProcess.unref()` so the CLI process can exit without waiting for editor
  - [x] Editor runs independently (fire-and-forget)

- [x] Task 3: Wire `validateEditorBinary` into `wh new` flow (AC: #2)
  - [x] Call `validateEditorBinary(config.editor)` **before** any worktree creation in `src/commands/new.ts`
  - [x] This ensures the error is surfaced before any filesystem changes occur

- [x] Task 4: Write unit tests in `tests/unit/core/workspace.test.ts` (AC: #1, #3)
  - [x] Test: `openWorkspace` calls spawn with editor binary and paths in order
  - [x] Test: `validateEditorBinary` exits 2 for an unknown binary

## Dev Notes

### Story dependencies

- Story 2.2 created `src/core/workspace.ts` with `saveWorkspace`, `loadWorkspace`, `listWorkspaces`, `deleteWorkspace`. This story adds `openWorkspace` and `validateEditorBinary` to the same file.
- Story 1.2: `printError` and `exitWithCode` from `output.ts`.

### `validateEditorBinary` — cross-platform approach

```typescript
import { spawnSync } from 'child_process';
import { printError, exitWithCode } from '../ui/output.js';
import { ExitCode } from '../types.js';

export function validateEditorBinary(editor: string): void {
  // 'which' on macOS/Linux; 'where' on Windows (not in scope but harmless)
  const result = spawnSync('which', [editor], { encoding: 'utf8' });
  if (result.status !== 0) {
    printError(`editor not found in PATH: ${editor}`);
    exitWithCode(ExitCode.ToolError);
  }
}
```

`spawnSync` is synchronous and appropriate here — this is a quick binary check at startup. The CLI is single-process; no concurrency concern.

### `openWorkspace` — fire-and-forget pattern

```typescript
import { spawn } from 'child_process';

export function openWorkspace(workspace: WorkspaceConfig, config: AppConfig): void {
  const paths = workspace.paths.map(p => p.path);
  const editorProcess = spawn(config.editor, paths, {
    detached: true,
    stdio: 'ignore',
  });
  editorProcess.unref();
}
```

Key details:
- `detached: true` — child process runs in its own process group, independent of the CLI
- `stdio: 'ignore'` — no stdout/stderr inheritance (editor manages its own output)
- `unref()` — allows the CLI event loop to exit without waiting for the editor

**Do NOT use `spawnSync` for the editor launch** — that would block until the editor exits, which is the opposite of fire-and-forget.

### Path ordering — critical correctness requirement (FR22)

`workspace.paths` is an ordered array. The editor receives paths in exactly this order. `loadWorkspace` preserves YAML array order (js-yaml guarantees this). The `openWorkspace` function must not sort or reorder paths.

### Where to call `validateEditorBinary`

Call it in `src/commands/new.ts` **before** any worktree creation:

```typescript
// src/commands/new.ts action handler:
const config = getActiveConfig();
validateEditorBinary(config.editor);  // ← AC #2: exit before filesystem changes
// ... scan origins, prompts, createWorktree, saveWorkspace ...
openWorkspace(savedWorkspace, config);
```

And in `src/commands/open.ts` (Story 3.2) as the first thing before opening.

### Testing `openWorkspace` — mock spawn

```typescript
import { vi } from 'vitest';
import * as childProcess from 'child_process';

it('launches editor with workspace paths in order', () => {
  const spawnSpy = vi.spyOn(childProcess, 'spawn').mockReturnValue({
    unref: vi.fn(),
  } as any);

  openWorkspace(mockWorkspace, mockConfig);

  expect(spawnSpy).toHaveBeenCalledWith(
    'zed',
    ['/path/to/repo-a-ticket', '/path/to/repo-b-ticket'],
    expect.objectContaining({ detached: true, stdio: 'ignore' })
  );
  spawnSpy.mockRestore();
});
```

### `spawnSync` import vs `spawn`

Import both from `child_process`:
```typescript
import { spawn, spawnSync } from 'child_process';
```

`spawnSync` for binary validation (sync check), `spawn` for editor launch (async fire-and-forget). These are Node.js built-ins — no external dependency.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Editor Launch]
- [Source: .agents/bmad/planning-artifacts/architecture.md#External system boundaries]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 2.5]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Validation commands: `npm test -- --run tests/unit/core/workspace.test.ts`, `npm run build`, `npm test`.
- End-to-end validation already exercised via the `wh new` flow with a fake editor binary, confirming fire-and-forget launch and path ordering.

### Completion Notes List

- Finalized `validateEditorBinary()` and `openWorkspace()` in `src/core/workspace.ts` and verified they stay aligned with the `wh new` flow.
- Added unit coverage proving editor launch preserves workspace path order, uses detached fire-and-forget spawning, and exits with ToolError when the editor binary is missing.
- Confirmed the `wh new` command calls editor validation before any worktree creation, matching the failure-before-filesystem-change requirement.

### File List

- .agents/bmad/implementation-artifacts/2-5-implement-editor-launch.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- tests/unit/core/workspace.test.ts

## Change Log

- 2026-04-28: Added explicit editor-launch unit coverage and finalized the editor validation/launch contract used by `wh new`.
