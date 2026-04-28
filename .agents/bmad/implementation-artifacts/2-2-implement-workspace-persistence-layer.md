# Story 2.2: Implement Workspace Persistence Layer

Status: review

## Story

As a developer,
I want my workspaces to be saved to and loaded from disk reliably,
so that my working contexts persist across shell sessions and machine restarts.

## Acceptance Criteria

1. **Given** a valid `WorkspaceConfig` object **When** `saveWorkspace(config)` is called **Then** a YAML file is written to `~/.config/workhub/workspaces/<name>.yaml` **And** the write uses atomic strategy: written to `<name>.yaml.tmp` then renamed to `<name>.yaml` **And** on write failure, the `.tmp` file is deleted and an error is thrown.
2. **Given** a workspace YAML file exists **When** `loadWorkspace(name)` is called **Then** it returns a fully typed `WorkspaceConfig` object **And** `paths` are returned in the order they were saved.
3. **Given** `listWorkspaces()` is called **When** the workspaces directory contains multiple YAML files **Then** it returns an array of all workspace names.
4. **Given** a workspace name containing characters other than alphanumeric and hyphens (e.g. `my workspace!`) **When** `saveWorkspace` is called **Then** it throws a validation error before any file is written.
5. **Given** the workspaces directory does not exist **When** `saveWorkspace` is called for the first time **Then** the directory is created automatically.

## Tasks / Subtasks

- [x] Task 1: Implement `resolveWorkspacesDir()` in `src/core/workspace.ts` (AC: #1, #5)
  - [x] Return `dirname(resolveConfigPath()) + '/workspaces'` — reuse `resolveConfigPath` from `config.ts`
  - [x] Import `resolveConfigPath` from `../core/config.js`

- [x] Task 2: Implement `saveWorkspace(config: WorkspaceConfig)` with atomic write (AC: #1, #4, #5)
  - [x] Validate workspace name: `/^[a-z0-9-]+$/i` — throw descriptive error if invalid
  - [x] Create workspaces directory if absent with `mkdir({ recursive: true })`
  - [x] Write YAML to `<name>.yaml.tmp` using `js-yaml.dump()`
  - [x] Rename `.tmp` to `<name>.yaml` using `fs.rename()` (atomic on POSIX)
  - [x] On any error: attempt to delete `.tmp`, then rethrow

- [x] Task 3: Implement `loadWorkspace(name: string)` (AC: #2)
  - [x] Read `<name>.yaml` from workspaces dir
  - [x] Parse with `js-yaml.load()`, cast to `WorkspaceConfig`
  - [x] Throw `Error(`Workspace not found: ${name}`)` if file does not exist

- [x] Task 4: Implement `listWorkspaces()` (AC: #3)
  - [x] Read workspaces directory with `readdir`
  - [x] Filter for `.yaml` files (not `.tmp`)
  - [x] Return names by stripping `.yaml` extension
  - [x] Return empty array if directory does not exist (not an error)

- [x] Task 5: Implement `deleteWorkspace(name: string)` (for Story 5.3 but natural to implement here)
  - [x] Delete `<name>.yaml` from workspaces dir
  - [x] Throw `Error(`Workspace not found: ${name}`)` if file does not exist

- [x] Task 6: Write unit tests in `tests/unit/core/workspace.test.ts` (AC: #1–#5)
  - [x] Test: `saveWorkspace` writes correct YAML file
  - [x] Test: atomic write — tmp is cleaned up on failure (mock `rename` to throw)
  - [x] Test: `loadWorkspace` returns correct typed object
  - [x] Test: `listWorkspaces` returns all workspace names
  - [x] Test: name validation rejects invalid characters
  - [x] Test: workspaces directory is created automatically

## Dev Notes

### Story dependencies

- Story 1.3 added `resolveConfigPath()` to `src/core/config.ts` — import it here.
- `src/core/workspace.ts` was an empty stub from Story 1.1 — implement it now.
- `WorkspaceConfig` and `OriginRepo` types are in `src/types.ts` from Stories 1.1 and 2.1.

### `resolveWorkspacesDir` — derive from config path

```typescript
import { resolveConfigPath } from './config.js';
import { dirname, join } from 'path';

function resolveWorkspacesDir(): string {
  return join(dirname(resolveConfigPath()), 'workspaces');
}
```

This ensures workspaces are always co-located with `config.yaml` regardless of XDG settings.

### Workspace name validation

```typescript
const VALID_NAME = /^[a-zA-Z0-9-]+$/;

function validateWorkspaceName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `Invalid workspace name: "${name}". Use only alphanumeric characters and hyphens.`
    );
  }
}
```

Call this **before** any filesystem operation in `saveWorkspace`.

### Atomic write implementation

```typescript
import { writeFile, rename, unlink, mkdir, readFile, readdir, rm } from 'fs/promises';
import yaml from 'js-yaml';
import type { WorkspaceConfig } from '../types.js';

export async function saveWorkspace(config: WorkspaceConfig): Promise<void> {
  validateWorkspaceName(config.name);
  const dir = resolveWorkspacesDir();
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${config.name}.yaml`);
  const tmpPath = `${filePath}.tmp`;

  try {
    await writeFile(tmpPath, yaml.dump(config), 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    try { await unlink(tmpPath); } catch { /* ignore cleanup error */ }
    throw err;
  }
}
```

`fs.rename()` is atomic on POSIX (macOS, Linux) when source and destination are on the same filesystem. Since both `.tmp` and `.yaml` are in the same directory, this is guaranteed.

### YAML schema for WorkspaceConfig

The workspace YAML must serialize as:
```yaml
name: ticket-1234
branch: feature/new-api
created_at: '2026-04-27T10:00:00.000Z'
paths:
  - repo: repo-a
    path: /path/to/repos/repo-a/.git/worktrees/feature-new-api
  - repo: repo-b
    path: /path/to/repos/repo-b/.git/worktrees/feature-new-api
```

`js-yaml.dump()` serializes this correctly from the `WorkspaceConfig` interface. The `created_at` field should be set to `new Date().toISOString()` at creation time in `saveWorkspace` if not already set.

### `loadWorkspace` — preserves path order

`js-yaml.load()` preserves array order, so `paths` will be returned in the order they were saved. This is critical for `wh open` which opens paths in persistence order (FR22).

### `listWorkspaces` — handle missing directory gracefully

```typescript
export async function listWorkspaces(): Promise<string[]> {
  const dir = resolveWorkspacesDir();
  try {
    const entries = await readdir(dir);
    return entries
      .filter(e => e.endsWith('.yaml') && !e.endsWith('.tmp.yaml'))
      .map(e => e.slice(0, -5)); // remove .yaml
  } catch {
    return []; // directory doesn't exist yet — no workspaces
  }
}
```

### Test isolation

Use `os.tmpdir()` for test workspace directories. Override `resolveConfigPath` by setting `XDG_CONFIG_HOME` to a temp dir in tests.

```typescript
beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'wh-ws-test-'));
  process.env.XDG_CONFIG_HOME = testDir;
});
afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME;
  await rm(testDir, { recursive: true, force: true });
});
```

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Architecture]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Atomic write strategy]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 2.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Red phase: `npm test -- --run tests/unit/core/workspace.test.ts` failed before implementation because the workspace persistence functions were still missing from `src/core/workspace.ts`.
- Validation commands: `npm test -- --run tests/unit/core/workspace.test.ts`, `npm run build`, `npm test`.

### Completion Notes List

- Implemented workspace directory resolution, atomic YAML writes, loading, listing, and deletion in `src/core/workspace.ts`.
- Added workspace name validation before any filesystem write and defaulted `created_at` during save when missing.
- Added unit tests covering atomic cleanup on rename failure, load/list behavior, invalid names, and automatic workspaces-directory creation.

### File List

- .agents/bmad/implementation-artifacts/2-2-implement-workspace-persistence-layer.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/core/workspace.ts
- tests/unit/core/workspace.test.ts

## Change Log

- 2026-04-28: Implemented the workspace persistence layer with atomic writes, filesystem-backed load/list/delete operations, and unit coverage for all persistence behaviors.
