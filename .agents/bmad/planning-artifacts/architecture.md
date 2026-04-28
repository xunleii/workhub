---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - .agents/bmad/planning-artifacts/prd.md
workflowType: 'architecture'
project_name: 'workhub'
user_name: 'xunleii'
date: '2026-04-27'
status: 'complete'
completedAt: '2026-04-27'
---

# Architecture Decision Document — workhub

**Author:** xunleii
**Date:** 2026-04-27

## Project Context Analysis

### Requirements Overview

**Functional Requirements (28 FRs across 6 capability areas):**

- **Workspace Management (FR1–7):** Create, list, reopen, edit, and delete named workspaces. Each workspace is a named, ordered set of local worktree paths.
- **Repository Discovery (FR8–11):** Scan an `origins` root directory to discover available repositories. Configurable via persistent YAML config.
- **Worktree Operations (FR12–15):** Create and remove Git worktrees per the system `git` binary (≥ 2.5). Create branch if absent. Detect stale paths.
- **Safety & Confirmation (FR16–20):** Check dirty/unpushed state before destructive ops. Show explicit operation preview. Require confirmation. `--force` skips prompt only when state is clean.
- **Editor Integration (FR21–23):** Launch configured editor (default: `zed`) with all workspace paths. Validate editor binary exists.
- **CLI Interaction (FR24–28):** All commands fully flaggable. TUI mode in TTY. Silent mode in non-TTY. Structured exit codes. Guided first-run setup.

**Non-Functional Requirements:**

- `wh open` → editor launch: < 5 seconds for ≤ 10 paths
- `wh new` full interactive flow: < 60 seconds for ≤ 10 repos
- Origins scan (≤ 200 repos): < 3 seconds
- Zero silent data loss; write failures preserve prior state
- Cross-platform: macOS and Linux

**Scale & Complexity:**

- Project complexity: **low** — single developer, no server, no auth, no database, no network
- Primary domain: local CLI tool + filesystem + Git operations
- Estimated architectural components: 4 commands, 3 core modules, 2 UI modules

### Technical Constraints & Dependencies

- Must use system `git` binary (≥ 2.5) — no embedded libgit2
- Must use `zed` CLI command (or user-configured editor) — no GUI launch APIs
- Config and workspace data stored locally under `~/.config/workhub/` — no remote sync
- No network access in MVP

### Cross-Cutting Concerns

- **Operation preview:** every destructive command must show what it will do before doing it
- **Exit codes:** structured codes used by all commands consistently (`0` success, `1` abort, `2` error, `3` git safety block)
- **TTY detection:** interactive mode and color output conditioned on `process.stdout.isTTY && !process.env.NO_COLOR`
- **Atomic writes:** workspace file writes are replace-on-success; partial states must never persist silently
- **Error routing:** all errors go to stderr; machine-consumable output goes to stdout

---

## Starter Template Evaluation

### Primary Technology Domain

CLI tool — Node.js with TypeScript, interactive TUI via `@clack/prompts`, no web framework, no bundler beyond `tsc`.

### Stack Decision

No published starter template covers this exact combination (Commander.js + @clack/prompts + simple-git). The project is initialized as a standard TypeScript Node.js CLI package. No scaffolding tool is used; the project structure is defined below and initialized manually.

**Initialization command:**

```bash
mkdir workhub && cd workhub
npm init -y
npm install typescript --save-dev
npx tsc --init
```

### Selected Technology Stack

| Concern | Package | Version | Rationale |
|---|---|---|---|
| Runtime | Node.js LTS | 24.x (24.15.0) | Current LTS, supported until Apr 2028 |
| Language | TypeScript | latest (5.8+) | Strict typing, first-class Node.js support |
| CLI parsing | commander | 14.0.3 | Mature, zero-dep, excellent TypeScript support |
| TUI/Prompts | @clack/prompts | 1.2.0 | User-specified; clean UX, composable prompts |
| Git operations | simple-git | 3.36.0 | Typed wrapper around system git binary |
| Config storage | js-yaml | 4.1.1 | Human-readable YAML for config + workspace files |
| Editor launch | Node.js built-in `child_process` | — | No extra dependency; `spawn` is sufficient |
| Testing | vitest | 4.1.4 | Fast, native TypeScript support, watch mode |
| Build | tsc | — | Direct TypeScript compilation, no bundler needed |

**Architectural decisions provided by this stack:**

- **Language:** TypeScript strict mode — all source in `src/`, compiled to `dist/`
- **Modules:** ESM (Node.js native modules with `"type": "module"` in package.json)
- **Entry point:** `dist/index.js` referenced in `package.json` `bin.wh`
- **Testing:** co-located test files in `tests/` mirroring `src/` structure
- **No bundler:** `tsc` output is the distribution artifact

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (block implementation):**
- ESM vs CJS module format
- Workspace storage schema (filename convention + field structure)
- Config file location and discovery order
- Git operation strategy (simple-git vs raw child_process)

**Important (shape architecture):**
- Command flag/prompt fallback strategy
- Exit code contract
- Atomic write strategy for workspace files
- @clack/prompts usage patterns (cancel handling)

**Deferred (post-MVP):**
- Shell completion generation
- Multiple origins roots
- Workspace tagging/metadata

### Module System

**Decision:** ESM (`"type": "module"`)

**Rationale:** Node.js 24 LTS has mature native ESM support. @clack/prompts 1.x ships as ESM-only. No CJS interop burden for a greenfield project. TypeScript `"module": "NodeNext"` with `"moduleResolution": "NodeNext"`.

### Data Architecture

**Config file location:** `~/.config/workhub/config.yaml`

Discovery order:
1. `$XDG_CONFIG_HOME/workhub/config.yaml` if `XDG_CONFIG_HOME` is set
2. `~/.config/workhub/config.yaml` otherwise

**Config schema:**
```yaml
origins: /path/to/repos
editor: zed
```

**Workspace store:** `~/.config/workhub/workspaces/<name>.yaml`

Filename: lowercase workspace name, sanitized (alphanumeric + hyphens only).

**Workspace schema:**
```yaml
name: ticket-1234
branch: feature/new-api
created_at: '2026-04-27T10:00:00Z'
paths:
  - repo: repo-a
    path: /path/to/repos/repo-a/.git/worktrees/feature-new-api
  - repo: repo-b
    path: /path/to/repos/repo-b/.git/worktrees/feature-new-api
```

**Atomic write strategy:** Write to `<name>.yaml.tmp`, then `fs.rename()` (atomic on POSIX). On failure, `.tmp` is deleted; original is preserved.

### Git Integration

**Decision:** `simple-git` 3.36.0

**Rationale:** Typed wrapper around system git binary. Respects `git` in `PATH`. Better error handling and output parsing than raw `child_process.exec`. Minimum git version: 2.5 (worktree support). The tool validates this at startup.

**Operations performed:**
- `git worktree add <path> <branch>` — via `simple-git`
- `git worktree remove <path>` — via `simple-git`
- `git status --porcelain` — detect uncommitted changes
- `git log @{u}..HEAD` — detect unpushed commits (skipped if no upstream)
- `git branch --list <branch>` — check branch existence

### CLI Parsing

**Decision:** Commander.js 14.0.3

**Rationale:** Zero dependencies, strong TypeScript types, supports subcommands with options and args. Does not conflict with @clack/prompts.

**Flag/prompt fallback contract:**
1. If all required inputs are provided via flags → skip all prompts (scriptable mode)
2. If running in a TTY and a required input is missing → prompt via @clack/prompts
3. If NOT in a TTY and a required input is missing → print error to stderr, exit code 2

### Editor Launch

**Decision:** Node.js built-in `child_process.spawnSync`

**Pattern:**
```typescript
spawnSync(editorBin, paths, { stdio: 'inherit', detached: false })
```

The editor binary is validated (via `which`-equivalent check) before any workspace operation begins. Error if not found: stderr message + exit code 2.

### Authentication & Security

Not applicable — no auth, no network, no sensitive data beyond local filesystem paths.

### Infrastructure & Deployment

**Distribution:** npm package with `bin.wh` pointing to `dist/index.js`.

**Install:** `npm install -g workhub` (global install).

**No CI/CD** required for MVP — solo developer, local distribution.

---

## Implementation Patterns & Consistency Rules

### Naming Patterns

**YAML field naming:** `snake_case` for all YAML config and workspace fields.
- ✅ `created_at`, `origins`, `repo`, `path`
- ❌ `createdAt`, `originPath`

**TypeScript variable/function naming:** `camelCase` for variables and functions; `PascalCase` for types and interfaces.
- ✅ `loadWorkspace()`, `WorkspaceConfig`, `gitSafetyCheck()`
- ❌ `load_workspace()`, `workspaceconfig`

**File naming:** `kebab-case` for source files.
- ✅ `workspace.ts`, `git-ops.ts`, `new.ts`
- ❌ `Workspace.ts`, `gitOps.ts`

**Command naming:** `wh <verb>` — all lowercase, single verb, no abbreviations.

### Structure Patterns

**Command files** (`src/commands/*.ts`): Each file exports a single Commander `Command` object. The command file contains only argument/option parsing and prompt orchestration — no business logic.

**Core modules** (`src/core/*.ts`): Pure business logic. No @clack/prompts imports. No Commander imports. Testable in isolation. All I/O (filesystem, git) lives here.

**UI modules** (`src/ui/*.ts`): All @clack/prompts usage lives here. Wraps prompts into typed, reusable functions. Commands call UI functions to collect inputs.

**Types** (`src/types.ts`): All shared TypeScript types and interfaces. Single source of truth. No type definitions scattered across files.

### Format Patterns

**Exit codes (enforced across all commands):**

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | User abort (e.g., cancelled at prompt, Ctrl+C) |
| `2` | Tool error (invalid input, missing binary, file I/O error) |
| `3` | Git safety check blocked the operation (dirty/unpushed state) |

**@clack/prompts cancel handling:** Every prompt result must be checked for cancellation. If user cancels (Ctrl+C), call `clack.cancel('Operation cancelled.')` and `process.exit(1)`.

```typescript
const name = await clack.text({ message: 'Workspace name:' });
if (clack.isCancel(name)) {
  clack.cancel('Operation cancelled.');
  process.exit(1);
}
```

**TTY/color detection (applied once at startup):**

```typescript
export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
```

**Stderr vs stdout split:**
- User-facing messages (prompts, warnings, confirmations): @clack/prompts (stdout-adjacent)
- Errors: `process.stderr.write()`
- Machine output (workspace list in scriptable mode): `process.stdout.write()`

**Operation preview format** (before any destructive action):

```
The following operations will be performed:
  [CREATE] /path/to/repo-a/.git/worktrees/feature-new-api
  [CREATE] /path/to/repo-b/.git/worktrees/feature-new-api
  [WRITE]  ~/.config/workhub/workspaces/ticket-1234.yaml
```

**Git safety warning format** (before delete/edit with dirty state):

```
Git safety check failed:
  repo-a  1 uncommitted file(s)
  repo-b  3 unpushed commit(s)
Aborting. Use --force to skip this check when state is clean.
```

### Process Patterns

**Destructive operation flow** (shared by `wh delete`, `wh edit --remove`):
1. Git safety check for each affected path
2. If any check fails → print warning, exit 3 (unless `--force` and all paths are clean)
3. Show operation preview
4. Prompt for confirmation (or skip if `--force` and state is clean)
5. Execute operations
6. Update workspace YAML (atomic write)
7. Print completion summary

**First-run flow** (`wh new` when no config exists):
1. Detect missing config file
2. Run `clack.intro()` with welcome message
3. Prompt for `origins` path (with path validation)
4. Write `~/.config/workhub/config.yaml`
5. Continue with normal `wh new` flow

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
workhub/
├── package.json                  # name: "workhub", bin: { wh: "dist/index.js" }
├── tsconfig.json                 # module: NodeNext, moduleResolution: NodeNext, strict: true
├── vitest.config.ts
├── .gitignore                    # dist/, node_modules/, *.tmp
├── README.md
├── src/
│   ├── index.ts                  # CLI entry: registers all commands, calls program.parse()
│   ├── types.ts                  # WorkspaceConfig, AppConfig, SafetyCheckResult, ExitCode enum
│   ├── commands/
│   │   ├── new.ts                # wh new — prompt orchestration + calls core/workspace + core/git
│   │   ├── open.ts               # wh open — workspace selection + editor launch
│   │   ├── edit.ts               # wh edit — add/remove paths
│   │   └── delete.ts             # wh delete — safety checks + workspace removal
│   ├── core/
│   │   ├── config.ts             # loadConfig(), saveConfig(), resolveConfigPath()
│   │   ├── workspace.ts          # loadWorkspace(), saveWorkspace(), listWorkspaces(),
│   │   │                         #   deleteWorkspace(), addPath(), removePath()
│   │   └── git.ts                # createWorktree(), removeWorktree(), checkDirty(),
│   │                             #   checkUnpushed(), branchExists(), createBranch(),
│   │                             #   scanOrigins(), validateGitVersion()
│   └── ui/
│       ├── prompts.ts            # promptWorkspaceName(), promptRepoSelection(),
│       │                         #   promptBranchName(), promptConfirm(), promptWorkspaceSelect()
│       └── output.ts             # printPreview(), printSafetyWarning(), printSuccess(),
│                                 #   isTTY, exitWithCode()
├── tests/
│   ├── unit/
│   │   ├── core/
│   │   │   ├── config.test.ts
│   │   │   ├── workspace.test.ts
│   │   │   └── git.test.ts
│   │   └── commands/
│   │       ├── new.test.ts
│   │       ├── open.test.ts
│   │       ├── edit.test.ts
│   │       └── delete.test.ts
│   └── fixtures/
│       ├── sample-config.yaml
│       └── sample-workspace.yaml
└── dist/                         # tsc output (gitignored)
    └── index.js
```

### Architectural Boundaries

**Command → UI → Core boundary:**

```
src/commands/*.ts
  ↓ calls
src/ui/prompts.ts       (interactive input collection)
src/ui/output.ts        (display + exit)
  ↓ calls
src/core/config.ts      (config read/write)
src/core/workspace.ts   (workspace CRUD)
src/core/git.ts         (git + filesystem ops)
```

- Commands never import from `core/` directly without going through UI for inputs
- Core modules never import from `commands/` or `ui/`
- `types.ts` is imported by all layers; no circular imports

**External system boundaries:**

| System | Accessed via | Location |
|---|---|---|
| `~/.config/workhub/` | `fs/promises` + `js-yaml` | `src/core/config.ts`, `src/core/workspace.ts` |
| System `git` binary | `simple-git` | `src/core/git.ts` |
| Editor binary (`zed`) | `child_process.spawnSync` | `src/core/workspace.ts` (open function) |
| Terminal TUI | `@clack/prompts` | `src/ui/prompts.ts`, `src/ui/output.ts` |

### Requirements to Structure Mapping

| FR Group | Primary Location |
|---|---|
| FR1–7 Workspace Management | `src/core/workspace.ts` + `src/commands/*.ts` |
| FR8–11 Repository Discovery | `src/core/git.ts` (scanOrigins) + `src/core/config.ts` |
| FR12–15 Worktree Operations | `src/core/git.ts` |
| FR16–20 Safety & Confirmation | `src/core/git.ts` + `src/ui/prompts.ts` + `src/ui/output.ts` |
| FR21–23 Editor Integration | `src/core/workspace.ts` (openWorkspace) |
| FR24–28 CLI Interaction | `src/index.ts` + `src/commands/*.ts` + `src/ui/output.ts` |

### Data Flow

```
wh new:
  index.ts → commands/new.ts
    → ui/prompts.ts (name, repo selection, branch)
    → core/config.ts (load config, get origins)
    → core/git.ts (scanOrigins, validateBranch, createWorktree × N)
    → ui/output.ts (preview, progress)
    → core/workspace.ts (saveWorkspace)
    → core/workspace.ts (openWorkspace → spawnSync zed)

wh open:
  index.ts → commands/open.ts
    → core/workspace.ts (listWorkspaces)
    → ui/prompts.ts (select workspace if name not given)
    → core/workspace.ts (openWorkspace → spawnSync zed)

wh delete:
  index.ts → commands/delete.ts
    → core/workspace.ts (loadWorkspace)
    → core/git.ts (checkDirty, checkUnpushed per path)
    → ui/output.ts (printSafetyWarning if needed → exit 3)
    → ui/output.ts (printPreview)
    → ui/prompts.ts (promptConfirm, unless --force)
    → core/git.ts (removeWorktree per path)
    → core/workspace.ts (deleteWorkspace)
```

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technologies are ESM-compatible. Node.js 24 LTS, TypeScript NodeNext module resolution, @clack/prompts 1.x (ESM-only), Commander 14, simple-git 3.x, js-yaml 4.x all work together without conflicts.

**Pattern Consistency:** Naming conventions (snake_case YAML, camelCase TS, kebab-case files) are mutually exclusive by layer and do not conflict. The command → UI → core boundary prevents circular imports. @clack/prompts cancel handling is uniformly enforced at the prompt call site.

**Structure Alignment:** The `src/commands/`, `src/core/`, `src/ui/` split directly mirrors the operation flow. FR groups map cleanly to module boundaries. No module is responsible for more than one concern.

### Requirements Coverage Validation ✅

**FR Coverage:** All 28 FRs are covered by at least one module in the project structure:
- FR1–7: `workspace.ts` + all command files ✅
- FR8–11: `git.ts` (scanOrigins) + `config.ts` ✅
- FR12–15: `git.ts` ✅
- FR16–20: `git.ts` + `prompts.ts` + `output.ts` ✅
- FR21–23: `workspace.ts` (openWorkspace) ✅
- FR24–28: `index.ts` + command files + `output.ts` ✅

**NFR Coverage:**
- Performance (< 5s open, < 60s new, < 3s scan): addressed via `simple-git` concurrent worktree ops + async origins scan ✅
- Reliability (atomic writes, no silent corruption): atomic YAML write strategy documented and enforced ✅
- macOS + Linux compatibility: Node.js 24 + POSIX `fs.rename` + `~/.config` XDG path ✅

### Gap Analysis

**No critical gaps identified.**

Minor notes for post-MVP:
- Shell completions (`commander` supports this natively in v14 via `generateCompletion()`) — can be added without architectural changes
- Multiple origins roots — requires only a config schema extension (`origins: string | string[]`)

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] All 28 FRs analyzed and mapped to architectural components
- [x] NFRs (performance, reliability, integration) addressed
- [x] Technical constraints (system git, system editor, local-only) respected

**✅ Architectural Decisions**
- [x] Runtime: Node.js 24 LTS
- [x] Language: TypeScript ESM strict
- [x] CLI framework: Commander 14.0.3
- [x] TUI: @clack/prompts 1.2.0
- [x] Git: simple-git 3.36.0
- [x] Storage: js-yaml 4.1.1 + YAML files
- [x] Testing: Vitest 4.1.4

**✅ Implementation Patterns**
- [x] Naming conventions: snake_case YAML, camelCase TS, kebab-case files
- [x] Command → UI → Core boundary defined and enforced
- [x] Exit code contract (0/1/2/3) fully specified
- [x] @clack/prompts cancel handling pattern defined
- [x] Atomic write strategy for workspace files
- [x] Destructive operation flow (preview → confirm → execute) standardized
- [x] Operation preview and safety warning format defined

**✅ Project Structure**
- [x] Complete directory tree with all files
- [x] All external system boundaries mapped
- [x] Data flow for each command documented
- [x] FR-to-file mapping complete

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level:** High — this is a low-complexity, well-bounded CLI tool with no ambiguous integrations, no auth, no network, and a stack that is entirely standard for Node.js CLI development.

**Key Strengths:**
- Clean three-layer separation (commands / UI / core) makes each layer independently testable
- All destructive operations share a single documented flow — no risk of inconsistent safety behavior across commands
- ESM-first from the start avoids CJS/ESM interop pain later

**Areas for future enhancement:**
- Integration tests against a real git repository (currently only unit tests scoped)
- Shell completion generation once MVP is stable

### Implementation Handoff

**AI Agent Guidelines:**
- All `@clack/prompts` usage in `src/ui/prompts.ts` only — no prompt calls in commands or core
- All `simple-git` usage in `src/core/git.ts` only
- Check `clack.isCancel()` after every prompt — no exceptions
- All file writes to workspace store use the atomic write pattern (write `.tmp`, then `fs.rename`)
- Always route errors to `process.stderr`, not `console.error`
- TTY/color check lives in `src/ui/output.ts` only — do not re-implement elsewhere

**First implementation story:** Initialize the project scaffold (`package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, empty `src/index.ts` with Commander setup and a `wh --version` command).
