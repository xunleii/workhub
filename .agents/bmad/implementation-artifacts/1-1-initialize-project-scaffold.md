# Story 1.1: Initialize Project Scaffold

Status: review

## Story

As a developer building workhub,
I want the TypeScript project structure, CLI entry point, and tooling initialized,
so that all subsequent development has a consistent, buildable foundation.

## Acceptance Criteria

1. **Given** the repository is cloned **When** `npm install && npm run build` is executed **Then** the project compiles without TypeScript errors to `dist/` **And** `wh --version` outputs the current package version **And** `wh --help` lists the four subcommands (new, open, edit, delete).
2. **Given** `npm test` is executed **When** no test files exist yet **Then** Vitest exits 0 with a "no test files found" message (not an error).
3. **Given** the project structure **When** a developer inspects `src/` **Then** the directories `commands/`, `core/`, and `ui/` exist with placeholder files **And** `src/types.ts` exists with the `WorkspaceConfig`, `AppConfig`, `SafetyCheckResult`, and `ExitCode` type definitions.

## Tasks / Subtasks

- [x] Task 1: Initialize npm package (AC: #1, #3)
  - [x] Create `package.json` with correct `name`, `version`, `type: "module"`, `bin`, `scripts`, `dependencies`, `devDependencies`, `engines`
  - [x] Install all runtime and dev dependencies at pinned versions
  - [x] Create `.gitignore` with `dist/`, `node_modules/`, `*.tmp`

- [x] Task 2: Configure TypeScript (AC: #1)
  - [x] Create `tsconfig.json` with `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `outDir: "dist"`, `rootDir: "src"`, `target: "ES2022"`
  - [x] Ensure `tests/` is excluded from compilation (tests import from `src/` directly via vitest)

- [x] Task 3: Configure Vitest (AC: #2)
  - [x] Create `vitest.config.ts` with `passWithNoTests: true` so `npm test` exits 0 when no tests exist

- [x] Task 4: Create `src/types.ts` with all shared types (AC: #3)
  - [x] `AppConfig` interface: `origins: string`, `editor: string`
  - [x] `WorkspaceConfig` interface: `name: string`, `branch: string`, `created_at: string`, `paths: Array<{ repo: string; path: string }>`
  - [x] `SafetyCheckResult` interface: `path: string`, `dirty: boolean`, `unpushed: boolean`
  - [x] `ExitCode` enum: `Success = 0`, `UserAbort = 1`, `ToolError = 2`, `GitSafetyBlock = 3`

- [x] Task 5: Create `src/index.ts` CLI entry point (AC: #1)
  - [x] Add `#!/usr/bin/env node` shebang as first line
  - [x] Register Commander program with `name('wh')`, `description(...)`, `version(...)` (read version from package.json)
  - [x] Register four stub subcommands: `new [name]`, `open [name]`, `edit <name>`, `delete <name>` (description only — no action logic)
  - [x] Call `program.parse()` at end

- [x] Task 6: Create placeholder module files (AC: #3)
  - [x] `src/commands/new.ts` — export stub `Command`
  - [x] `src/commands/open.ts` — export stub `Command`
  - [x] `src/commands/edit.ts` — export stub `Command`
  - [x] `src/commands/delete.ts` — export stub `Command`
  - [x] `src/core/config.ts` — export empty stubs
  - [x] `src/core/workspace.ts` — export empty stubs
  - [x] `src/core/git.ts` — export empty stubs
  - [x] `src/ui/prompts.ts` — export empty stubs
  - [x] `src/ui/output.ts` — export `isTTY` constant and `exitWithCode` function (real implementations, not stubs — Story 1.2 depends on them being correct here)

- [x] Task 7: Create test fixtures (AC: #2)
  - [x] `tests/fixtures/sample-config.yaml` matching `AppConfig` schema
  - [x] `tests/fixtures/sample-workspace.yaml` matching `WorkspaceConfig` schema

- [x] Task 8: Verify acceptance criteria manually
  - [x] Run `npm install && npm run build` — must succeed with zero TypeScript errors
  - [x] Run `wh --version` — must print version from package.json
  - [x] Run `wh --help` — must list `new`, `open`, `edit`, `delete` subcommands
  - [x] Run `npm test` — must exit 0 (passWithNoTests)

## Dev Notes

### Critical: ESM import convention

**This project uses TypeScript NodeNext module resolution.** When importing other TypeScript source files, you MUST use the `.js` extension in the import path — not `.ts`. This is a firm NodeNext requirement.

```typescript
// CORRECT
import { newCommand } from './commands/new.js';
import { ExitCode } from '../types.js';

// WRONG — will fail at runtime
import { newCommand } from './commands/new';
import { ExitCode } from '../types';
```

This applies to all files in `src/`. Vitest handles this correctly via its own resolver.

### `src/index.ts` — read version from package.json

With ESM + NodeNext, the cleanest way to read the package version at runtime is via `createRequire`:

```typescript
#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('wh')
  .description('Local-first CLI for managing Git worktrees grouped into persistent workspaces')
  .version(version);

program.command('new [name]').description('Create a new workspace');
program.command('open [name]').description('Open an existing workspace');
program.command('edit <name>').description('Edit an existing workspace');
program.command('delete <name>').description('Delete a workspace and its worktrees');

program.parse();
```

Do NOT hardcode the version string — it must come from `package.json` to stay in sync.

### `src/ui/output.ts` — implement correctly now, not as a stub

Story 1.2 will import `isTTY` and `exitWithCode` from `src/ui/output.ts`. Implement them correctly in this story:

```typescript
export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

export function exitWithCode(code: number): never {
  process.exit(code);
}
```

`isTTY` is a module-level constant evaluated once at startup. No other file should re-implement TTY detection.

### `src/types.ts` — exact shapes

```typescript
export interface AppConfig {
  origins: string;
  editor: string;
}

export interface WorkspaceConfig {
  name: string;
  branch: string;
  created_at: string;
  paths: Array<{ repo: string; path: string }>;
}

export interface SafetyCheckResult {
  path: string;
  dirty: boolean;
  unpushed: boolean;
}

export enum ExitCode {
  Success = 0,
  UserAbort = 1,
  ToolError = 2,
  GitSafetyBlock = 3,
}
```

`ExitCode` is an enum, not a `const` object. The architecture specifies enum.

### `tsconfig.json` — exact required fields

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`"tests"` is excluded so Vitest test files are not compiled by `tsc`. Vitest handles TypeScript itself.

### `vitest.config.ts` — passWithNoTests is mandatory

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});
```

Without `passWithNoTests: true`, `npm test` exits non-zero when no test files are found — breaking AC #2.

### `package.json` — exact pinned versions

```json
{
  "name": "workhub",
  "version": "0.1.0",
  "description": "Local-first CLI for managing Git worktrees grouped into persistent workspaces",
  "type": "module",
  "bin": {
    "wh": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=24.0.0"
  },
  "dependencies": {
    "@clack/prompts": "1.2.0",
    "commander": "14.0.3",
    "js-yaml": "4.1.1",
    "simple-git": "3.36.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vitest": "4.1.4"
  }
}
```

**Use these exact versions for runtime deps** — `@clack/prompts 1.2.0`, `commander 14.0.3`, `js-yaml 4.1.1`, `simple-git 3.36.0`, `vitest 4.1.4`. No version drift.

### Stub command files — pattern to follow

Each `src/commands/*.ts` file exports a `Command` object. In Story 1.1, these are stubs (no action logic). Use this pattern:

```typescript
// src/commands/new.ts
import { Command } from 'commander';

export const newCommand = new Command('new')
  .description('Create a new workspace')
  .argument('[name]', 'workspace name');
```

**Do not call `program.addCommand(newCommand)` from `src/index.ts` yet in Story 1.1** — the stub commands registered directly on `program` in `src/index.ts` are sufficient for `wh --help` to list them. The command files exist as placeholders for Story 2.4+. Leave `src/index.ts` using inline `.command()` stubs rather than importing from `src/commands/` — importing from commands/ in index.ts is the final wiring done in the command implementation stories.

### Stub core and UI files — minimal valid TypeScript

Core and UI stubs only need to be valid TypeScript that compiles. Empty files with a comment are fine:

```typescript
// src/core/config.ts
// Implemented in Story 1.3 and 1.4
export {};
```

Exception: `src/ui/output.ts` has real implementation (see above).

### Test fixture schemas

```yaml
# tests/fixtures/sample-config.yaml
origins: /tmp/test-repos
editor: zed
```

```yaml
# tests/fixtures/sample-workspace.yaml
name: ticket-1234
branch: feature/test
created_at: '2026-04-27T10:00:00Z'
paths:
  - repo: repo-a
    path: /tmp/test-repos/repo-a/.git/worktrees/feature-test
  - repo: repo-b
    path: /tmp/test-repos/repo-b/.git/worktrees/feature-test
```

### `.gitignore`

```
dist/
node_modules/
*.tmp
```

### Project Structure Notes

This story creates the complete directory skeleton. Every file listed in the architecture must exist after this story, even if empty:

```
workhub/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── index.ts            ← real implementation (shebang + Commander + stub commands)
│   ├── types.ts            ← real implementation (all types)
│   ├── commands/
│   │   ├── new.ts          ← stub Command export
│   │   ├── open.ts         ← stub Command export
│   │   ├── edit.ts         ← stub Command export
│   │   └── delete.ts       ← stub Command export
│   ├── core/
│   │   ├── config.ts       ← empty stub (export {})
│   │   ├── workspace.ts    ← empty stub (export {})
│   │   └── git.ts          ← empty stub (export {})
│   └── ui/
│       ├── prompts.ts      ← empty stub (export {})
│       └── output.ts       ← REAL implementation (isTTY, exitWithCode)
└── tests/
    ├── unit/
    │   ├── core/           ← empty dir (add .gitkeep)
    │   └── commands/       ← empty dir (add .gitkeep)
    └── fixtures/
        ├── sample-config.yaml
        └── sample-workspace.yaml
```

Empty directories need a `.gitkeep` file so git tracks them.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Selected Technology Stack]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Module System]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Complete Project Directory Structure]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Implementation Handoff]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Naming Patterns]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Baseline red state: `npm run build` failed before scaffold creation because `package.json` was missing.
- Validation commands: `npm install --no-fund --no-audit`, `npm run build`, `npm link --no-fund --no-audit`, `wh --version`, `wh --help`, `npm test`.
- Final regression suite: `npm run build && npm test`.

### Completion Notes List

- Created the full Node.js + TypeScript ESM scaffold with the exact pinned runtime and test dependencies required by the story.
- Added the CLI entrypoint, shared type definitions, placeholder command/core/UI modules, and the initial `src/ui/output.ts` implementation for `isTTY` and `exitWithCode`.
- Added fixture YAML files and tracked empty test directories with `.gitkeep` so the initial project structure matches the architecture and story notes.
- Validated the acceptance criteria with successful build/help/version flows and `vitest` configured to exit 0 when no test files exist.

### File List

- .gitignore
- README.md
- package-lock.json
- package.json
- src/commands/delete.ts
- src/commands/edit.ts
- src/commands/new.ts
- src/commands/open.ts
- src/core/config.ts
- src/core/git.ts
- src/core/workspace.ts
- src/index.ts
- src/types.ts
- src/ui/output.ts
- src/ui/prompts.ts
- tests/fixtures/sample-config.yaml
- tests/fixtures/sample-workspace.yaml
- tests/unit/commands/.gitkeep
- tests/unit/core/.gitkeep
- tsconfig.json
- vitest.config.ts

## Change Log

- 2026-04-28: Initialized the project scaffold, installed pinned dependencies, added the initial CLI/types/stub modules, and verified build/help/version/test behavior for Story 1.1.
