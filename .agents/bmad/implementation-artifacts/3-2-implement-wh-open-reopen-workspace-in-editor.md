# Story 3.2: Implement `wh open` — Reopen Workspace in Editor

Status: ready-for-dev

## Story

As a developer returning to an in-progress task,
I want to reopen an existing workspace in my editor with a single command,
so that I can restore my working context instantly without any manual steps.

## Acceptance Criteria

1. **Given** `wh open ticket-1234` is run and the workspace exists **When** the command runs **Then** the editor is launched with all persisted paths in persistence order **And** the command completes (editor launched) in under 5 seconds.
2. **Given** `wh open` is run without a workspace name in a TTY **When** the command runs **Then** an interactive list of all workspaces is shown for selection **And** selecting a workspace launches the editor with its paths.
3. **Given** `wh open ticket-1234` is run and one path is stale **When** the command runs **Then** a warning is printed to stderr listing the stale path(s) **And** the editor is launched with the remaining valid paths (stale paths excluded) **And** the process exits with code 0.
4. **Given** `wh open ticket-1234` is run and the workspace does not exist **When** the command runs **Then** an error is written to stderr: "workspace not found: ticket-1234" **And** the process exits with code 2.
5. **Given** `wh open ticket-1234` is run in non-TTY mode **When** the command runs **Then** no interactive selection appears **And** the workspace is opened directly (name is required argument in non-TTY).

## Tasks / Subtasks

- [ ] Task 1: Implement `src/commands/open.ts` — full `wh open` command (AC: #1–#5)
  - [ ] Define argument: `[name]` (optional workspace name)
  - [ ] If name given: `loadWorkspace(name)` — catch "not found" error → exit 2
  - [ ] If name not given and TTY: `listWorkspaceSummaries()` → show empty message and exit 0 if none → `promptWorkspaceSelect(summaries)` → `loadWorkspace(selectedName)`
  - [ ] If name not given and non-TTY: error "workspace name required in non-TTY mode", exit 2
  - [ ] Validate editor binary before anything: `validateEditorBinary(config.editor)`
  - [ ] Separate valid paths from stale paths: check `access()` per path
  - [ ] If any stale: `printWarning(...)` listing stale paths
  - [ ] Launch editor with valid paths only via `openWorkspace`-like call (or inline)
  - [ ] Exit 0

- [ ] Task 2: Register `src/commands/open.ts` in `src/index.ts` replacing the stub (AC: #1)
  - [ ] Replace `program.command('open [name]').description(...)` with `program.addCommand(openCommand)`

- [ ] Task 3: Write tests in `tests/unit/commands/open.test.ts` (AC: #3, #4, #5)
  - [ ] Test: stale paths excluded from editor launch, warning printed
  - [ ] Test: workspace not found → exit 2
  - [ ] Test: non-TTY without name → exit 2

## Dev Notes

### Story dependencies

- Story 2.2: `loadWorkspace()` from `workspace.ts`
- Story 2.5: `openWorkspace()` and `validateEditorBinary()` from `workspace.ts`
- Story 3.1: `listWorkspaceSummaries()` and `promptWorkspaceSelect()` 
- Story 1.2: `isTTY`, `printError`, `printWarning`, `exitWithCode` from `output.ts`

### Stale path handling in `wh open`

Do not reuse `openWorkspace()` directly because it passes all paths. For `wh open` with stale path filtering, build the path list inline:

```typescript
const workspace = await loadWorkspace(name);
const validPaths: string[] = [];

for (const entry of workspace.paths) {
  try {
    await access(entry.path);
    validPaths.push(entry.path);
  } catch {
    printWarning(`Stale path excluded: ${entry.path}`);
  }
}

if (validPaths.length === 0) {
  printError('No valid paths in workspace — all paths are stale.');
  exitWithCode(ExitCode.ToolError);
}

// Launch editor with valid paths in original order
const editorProcess = spawn(config.editor, validPaths, { detached: true, stdio: 'ignore' });
editorProcess.unref();
```

Valid paths are in the original persistence order because `workspace.paths` array order is preserved by `loadWorkspace`.

### Non-TTY guard

```typescript
if (!nameArg && !isTTY) {
  printError('workspace name required in non-TTY mode');
  exitWithCode(ExitCode.ToolError);
}
```

### Performance — < 5 seconds (NFR1)

The 5-second budget for `wh open` includes:
1. Config load (negligible)
2. Workspace YAML load (negligible)
3. Path existence checks (concurrent, milliseconds)
4. Editor launch (spawn, milliseconds)

Sequential workspace file reads and concurrent path checks easily stay under 5 seconds even for 10 paths.

### "No workspaces" empty state (AC from Story 3.1)

```typescript
const summaries = await listWorkspaceSummaries();
if (summaries.length === 0) {
  printSuccess('No workspaces found. Run `wh new` to create one.');
  process.exit(ExitCode.Success);
}
```

Use `process.exit(ExitCode.Success)` directly here since `exitWithCode` is for errors. Or use `exitWithCode(ExitCode.Success)` — same result.

### `wh open <name> --status` not in this story

The `--status` flag is implemented in Story 3.3. The `open` command stub must include `--status` option definition so the flag is parsed, but its implementation is in Story 3.3. Add the option definition but guard its handling with a TODO or empty branch.

### import `spawn` from child_process

`open.ts` imports `spawn` from `child_process` directly for the fire-and-forget pattern (same as `workspace.ts`). Alternatively, extract a shared `launchEditor(editor, paths)` helper in `workspace.ts` that both `wh new` and `wh open` call.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Flow (wh open)]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 3.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
