# Story 2.1: Implement Origins Directory Scanner

Status: ready-for-dev

## Story

As a developer,
I want workhub to automatically discover available repositories from my configured origins root,
so that I can select repositories by name rather than typing full paths.

## Acceptance Criteria

1. **Given** an `origins` directory containing git repositories at depth 1 (e.g. `origins/repo-a/`) **When** `scanOrigins(originsPath)` is called **Then** it returns an array of `{ name: string, path: string }` for each git repository found **And** non-git directories are excluded from the result **And** the scan completes in under 3 seconds for up to 200 repositories.
2. **Given** the origins directory does not exist **When** `scanOrigins` is called **Then** it throws an error with a clear message (caller exits with code 2).
3. **Given** the origins directory is empty **When** `scanOrigins` is called **Then** it returns an empty array (no error).
4. **Given** the scan runs in unit tests **When** called with a mock filesystem path **Then** the function is testable without a real git installation.

## Tasks / Subtasks

- [ ] Task 1: Implement `scanOrigins(originsPath: string)` in `src/core/git.ts` (AC: #1, #2, #3)
  - [ ] Read directory entries at depth 1 using `fs/promises.readdir` with `{ withFileTypes: true }`
  - [ ] Filter to directories only
  - [ ] For each directory, check if `.git` subdirectory or file exists (makes it a git repo)
  - [ ] Run all `.git` checks concurrently with `Promise.all` (performance: AC #1 < 3s)
  - [ ] Return `Array<{ name: string; path: string }>` sorted by name
  - [ ] Throw `Error(`Origins directory not found: ${originsPath}`)` if path does not exist

- [ ] Task 2: Add `OriginRepo` type to `src/types.ts`
  - [ ] `export interface OriginRepo { name: string; path: string; }`

- [ ] Task 3: Write unit tests in `tests/unit/core/git.test.ts` (AC: #1, #2, #3, #4)
  - [ ] Test: returns repos from a real tmpdir with `.git` subdirectories
  - [ ] Test: excludes non-git directories
  - [ ] Test: throws on non-existent origins path
  - [ ] Test: returns empty array for empty origins directory

## Dev Notes

### Story dependencies

- Story 1.1: `src/core/git.ts` exists as an empty stub. This story adds `scanOrigins` to it.
- No prior git.ts functions exist yet — this is the first real implementation.
- Epic 1 stories (1.1–1.4) handle config loading. This story only implements `scanOrigins`; it does not call `getActiveConfig()` itself.

### `scanOrigins` — implementation

```typescript
import { readdir, access } from 'fs/promises';
import { join } from 'path';
import type { OriginRepo } from '../types.js';

export async function scanOrigins(originsPath: string): Promise<OriginRepo[]> {
  // Verify origins exists
  try {
    await access(originsPath);
  } catch {
    throw new Error(`Origins directory not found: ${originsPath}`);
  }

  const entries = await readdir(originsPath, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());

  // Check .git presence concurrently
  const results = await Promise.all(
    dirs.map(async (dir) => {
      const dirPath = join(originsPath, dir.name);
      const gitPath = join(dirPath, '.git');
      try {
        await access(gitPath);
        return { name: dir.name, path: dirPath };
      } catch {
        return null;
      }
    })
  );

  return results
    .filter((r): r is OriginRepo => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

Key: `Promise.all` runs all `.git` checks concurrently — this is what keeps the scan under 3 seconds for 200 repos (AC #1).

### `.git` detection

Checking for the existence of `.git` (as a directory or file — worktrees have `.git` as a file) is sufficient to identify a git repository. Do not run `git rev-parse` — that would require spawning 200 processes. Filesystem check via `access()` is fast and accurate for standard clones.

### `OriginRepo` type — add to `src/types.ts`

```typescript
export interface OriginRepo {
  name: string;
  path: string;
}
```

Add this to `src/types.ts` alongside the existing types from Story 1.1. All shared types live in `types.ts` — do not define `OriginRepo` inline in `git.ts`.

### Unit test approach — real tmpdir, no git binary needed

Tests use `os.tmpdir()` to create a temporary directory structure. No actual git operations are needed because `scanOrigins` only checks for `.git` directory existence.

```typescript
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanOrigins } from '../../../src/core/git.js';

describe('scanOrigins', () => {
  let originsDir: string;

  beforeEach(async () => {
    originsDir = await mkdtemp(join(tmpdir(), 'workhub-test-'));
    // Create repo-a with .git dir
    await mkdir(join(originsDir, 'repo-a', '.git'), { recursive: true });
    // Create repo-b with .git dir
    await mkdir(join(originsDir, 'repo-b', '.git'), { recursive: true });
    // Create non-git dir
    await mkdir(join(originsDir, 'not-a-repo'), { recursive: true });
  });

  afterEach(async () => {
    await rm(originsDir, { recursive: true, force: true });
  });

  it('returns only git repos sorted by name', async () => {
    const repos = await scanOrigins(originsDir);
    expect(repos).toEqual([
      { name: 'repo-a', path: join(originsDir, 'repo-a') },
      { name: 'repo-b', path: join(originsDir, 'repo-b') },
    ]);
  });

  it('throws on non-existent path', async () => {
    await expect(scanOrigins('/does/not/exist')).rejects.toThrow('Origins directory not found');
  });

  it('returns empty array for empty directory', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'workhub-empty-'));
    const repos = await scanOrigins(emptyDir);
    await rm(emptyDir, { recursive: true, force: true });
    expect(repos).toEqual([]);
  });
});
```

### Do NOT import `simple-git` in `scanOrigins`

`scanOrigins` uses only `fs/promises` — no `simple-git`. The `simple-git` import is reserved for worktree creation/removal and git status operations (Stories 2.3, 5.1). Adding `simple-git` to `scanOrigins` would spawn git processes for each directory, destroying the < 3s performance requirement.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Git Integration]
- [Source: .agents/bmad/planning-artifacts/architecture.md#External system boundaries]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 2.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
