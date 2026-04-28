---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - .agents/bmad/planning-artifacts/prd.md
  - .agents/bmad/planning-artifacts/architecture.md
---

# workhub — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **workhub**, decomposing all requirements from the PRD and Architecture into implementable stories ordered by user value.

---

## Requirements Inventory

### Functional Requirements

FR1: Developer can create a named workspace by selecting repositories and specifying a shared branch name.
FR2: Developer can reopen an existing workspace by name, launching the configured editor with the workspace's persisted paths.
FR3: Developer can list all persisted workspaces.
FR4: Developer can add a repository to an existing workspace.
FR5: Developer can remove a repository path from an existing workspace without deleting the underlying worktree from disk.
FR6: Developer can delete a workspace and all its associated worktrees from disk.
FR7: Developer can view the current state of a workspace, including all paths and their Git status.
FR8: Developer can browse repositories discovered from the configured origins root.
FR9: The tool scans the origins directory automatically to populate the repository selection list.
FR10: Developer can configure the origins root directory via a persistent config file.
FR11: Developer can configure the default editor via a persistent config file.
FR12: The tool creates Git worktrees for all selected repositories using the specified branch name.
FR13: The tool creates the specified branch in a repository if it does not already exist.
FR14: The tool removes Git worktrees from disk when a workspace or individual path is deleted.
FR15: The tool detects and reports stale workspace paths where the worktree directory no longer exists on disk.
FR16: The tool checks each worktree for uncommitted changes before any destructive operation.
FR17: The tool checks each worktree for unpushed commits before any destructive operation.
FR18: The tool displays an explicit preview of all filesystem and Git operations before executing them.
FR19: The tool requires explicit user confirmation before executing any destructive operation.
FR20: Developer can bypass the interactive confirmation prompt via an explicit flag, provided no dirty or unpushed state is detected.
FR21: The tool launches the configured editor with all workspace paths provided as project folders.
FR22: The tool opens workspace paths in the order they are stored in the workspace definition.
FR23: The tool validates that the configured editor binary is available before attempting to launch it.
FR24: Developer can complete all operations using command-line flags only, without interactive prompts.
FR25: The tool operates in TUI mode when run in a TTY without full flag coverage.
FR26: The tool suppresses interactive elements and color output in non-TTY environments.
FR27: The tool returns structured exit codes distinguishing success, user abort, tool error, and Git safety block.
FR28: The tool guides first-time users through initial configuration on first run when no config file exists.

### Non-Functional Requirements

NFR1: `wh open` completes from invocation to editor launch in under 5 seconds for a workspace with up to 10 paths on a standard developer laptop.
NFR2: `wh new` full interactive flow completes in under 60 seconds for up to 10 repositories.
NFR3: Origins directory scan for up to 200 repositories completes in under 3 seconds.
NFR4: Workspace state is never silently corrupted; any write failure is reported with the pre-operation state preserved.
NFR5: Worktree creation failures during `wh new` are reported clearly; no partial workspace is silently persisted as complete.
NFR6: The tool operates correctly on macOS and Linux.
NFR7: Git integration uses the system `git` binary; minimum required version is Git 2.5 (worktree support).
NFR8: Editor integration uses the configured editor's CLI command; default is `zed`.
NFR9: The tool requires no network access and no remote service in the MVP.

### Additional Requirements

- **Project scaffold:** First story initializes the TypeScript + ESM + Commander + @clack/prompts + simple-git + js-yaml + Vitest project structure before any feature work begins.
- **Layer boundary:** All `@clack/prompts` usage lives in `src/ui/` only. All `simple-git` usage lives in `src/core/git.ts` only. Command files do not import core directly without going through UI for inputs.
- **Atomic writes:** Every workspace YAML write must use the `.tmp` + `fs.rename()` pattern; partial writes must never persist silently.
- **@clack/prompts cancel handling:** Every prompt result must be checked with `clack.isCancel()`. Cancellation exits with code 1 after calling `clack.cancel()`.
- **Versions:** Node.js 24 LTS, TypeScript strict ESM, Commander 14.0.3, @clack/prompts 1.2.0, simple-git 3.36.0, js-yaml 4.1.1, Vitest 4.1.4.

### UX Design Requirements

No UX Design document exists for this project. Not applicable.

### FR Coverage Map

FR1: Epic 2 — Create workspace (TUI flow + workspace persistence)
FR2: Epic 3 — Reopen workspace (`wh open`)
FR3: Epic 3 — List workspaces (`wh open` selection / listing)
FR4: Epic 4 — Add repository (`wh edit --add`)
FR5: Epic 4 — Remove repository path (`wh edit --remove`)
FR6: Epic 5 — Delete workspace (`wh delete`)
FR7: Epic 3 — View workspace state (`wh open --status`)
FR8: Epic 2 — Browse repos from origins scan
FR9: Epic 2 — Automatic origins scan
FR10: Epic 1 — Configure origins root
FR11: Epic 1 — Configure default editor
FR12: Epic 2 — Create Git worktrees
FR13: Epic 2 — Create branch if absent
FR14: Epic 5 — Remove Git worktrees on delete
FR15: Epic 3 — Detect stale workspace paths
FR16: Epic 5 — Check uncommitted changes before destructive ops
FR17: Epic 5 — Check unpushed commits before destructive ops
FR18: Epic 5 — Show operation preview before execution
FR19: Epic 5 — Require explicit confirmation for destructive ops
FR20: Epic 5 — `--force` flag bypasses confirmation (not safety checks)
FR21: Epic 2 — Launch editor with workspace paths
FR22: Epic 2 — Open paths in persistence order
FR23: Epic 2 — Validate editor binary before launch
FR24: Epic 1 — Full flag-driven operation (cross-cutting, established in foundation)
FR25: Epic 1 — TUI mode in TTY
FR26: Epic 1 — Suppress interactive/color in non-TTY
FR27: Epic 1 — Structured exit codes
FR28: Epic 1 — First-run guided setup

---

## Epic List

### Epic 1: CLI Foundation & First-Run Setup
Developer can install workhub, run it for the first time, and complete initial configuration — giving the tool a working foundation for all subsequent commands.
**FRs covered:** FR10, FR11, FR24, FR25, FR26, FR27, FR28

### Epic 2: Create Workspace
Developer can create a named workspace by selecting repositories, specifying a branch, and immediately opening the result in the editor — replacing 5+ minutes of manual setup with a single command.
**FRs covered:** FR1, FR8, FR9, FR12, FR13, FR21, FR22, FR23

### Epic 3: Open and Inspect Workspaces
Developer can list existing workspaces, reopen any workspace in the editor instantly, inspect workspace state including stale paths and git status, and get warnings when paths no longer exist.
**FRs covered:** FR2, FR3, FR7, FR15

### Epic 4: Edit Workspace
Developer can add a new repository to an existing workspace or disassociate a repository path without deleting the worktree — allowing the working context to evolve without recreation.
**FRs covered:** FR4, FR5

### Epic 5: Safe Workspace Deletion
Developer can delete a workspace and all its worktrees with complete visibility into what will be removed and protection against data loss from uncommitted or unpushed work.
**FRs covered:** FR6, FR14, FR16, FR17, FR18, FR19, FR20

---

## Epic 1: CLI Foundation & First-Run Setup

Developer can install workhub as a global npm package, run `wh` for the first time, be guided through initial configuration, and have all subsequent commands operate with consistent TTY detection, exit codes, and error routing.

### Story 1.1: Initialize Project Scaffold

As a developer building workhub,
I want the TypeScript project structure, CLI entry point, and tooling initialized,
So that all subsequent development has a consistent, buildable foundation.

**Acceptance Criteria:**

**Given** the repository is cloned
**When** `npm install && npm run build` is executed
**Then** the project compiles without TypeScript errors to `dist/`
**And** `wh --version` outputs the current package version
**And** `wh --help` lists the four subcommands (new, open, edit, delete)

**Given** `npm test` is executed
**When** no test files exist yet
**Then** Vitest exits 0 with a "no test files found" message (not an error)

**Given** the project structure
**When** a developer inspects `src/`
**Then** the directories `commands/`, `core/`, and `ui/` exist with placeholder index files
**And** `src/types.ts` exists with the `WorkspaceConfig`, `AppConfig`, and `ExitCode` type definitions

---

### Story 1.2: Implement Cross-Cutting CLI Infrastructure

As a developer using workhub in scripts and automation,
I want the tool to detect TTY mode, suppress interactive output in non-TTY environments, route errors to stderr, and return structured exit codes,
So that I can use it reliably in scripts and CI pipelines.

**Acceptance Criteria:**

**Given** workhub is run with stdout redirected to a file (non-TTY)
**When** any command executes
**Then** no ANSI color codes appear in the output
**And** no interactive prompts are rendered
**And** `process.env.NO_COLOR=1` also suppresses color in TTY mode

**Given** a command succeeds
**When** it exits
**Then** the process exit code is `0`

**Given** a user cancels a prompt with Ctrl+C or selects cancel
**When** the process exits
**Then** the exit code is `1`

**Given** an invalid argument or missing binary is detected
**When** the process exits
**Then** the exit code is `2` and an error message is written to stderr (not stdout)

**Given** a Git safety check blocks a destructive operation
**When** the process exits
**Then** the exit code is `3` and the safety warning is written to stderr

**Given** `src/ui/output.ts`
**When** reviewed
**Then** `isTTY` is defined as `Boolean(process.stdout.isTTY) && !process.env.NO_COLOR`
**And** `exitWithCode(code)` calls `process.exit(code)`
**And** no other file re-implements TTY detection

---

### Story 1.3: Implement First-Run Configuration Setup

As a developer using workhub for the first time,
I want to be guided through configuring the origins root and default editor,
So that I can start using the tool without reading documentation.

**Acceptance Criteria:**

**Given** no config file exists at `~/.config/workhub/config.yaml`
**When** `wh new` (or any command) is run
**Then** a welcome intro is displayed via `@clack/prompts`
**And** the user is prompted for the `origins` root directory path
**And** the user is prompted for the default editor (default: `zed`)
**And** the provided paths are validated (origins directory must exist)
**And** config is saved to `~/.config/workhub/config.yaml`
**And** the original command continues after setup completes

**Given** no config file exists and the tool runs in non-TTY mode
**When** `wh new --origins /path/to/repos --editor zed` is executed
**Then** first-run setup completes without interactive prompts using the flag values
**And** config is saved and the command continues

**Given** a config file already exists
**When** any command runs
**Then** first-run setup is skipped entirely

**Given** the user cancels first-run setup
**When** the process exits
**Then** exit code is `1` and no config file is written

**Given** an invalid origins path is provided
**When** setup validates it
**Then** an error is shown and the prompt repeats (or exits 2 in non-TTY)

---

### Story 1.4: Implement Config Loading and Validation

As a developer,
I want workhub to load and validate my configuration on each run,
So that misconfigured installations fail with clear errors instead of mysterious behavior.

**Acceptance Criteria:**

**Given** a valid config file at `~/.config/workhub/config.yaml`
**When** any command starts
**Then** config is loaded and `origins` path is available to all commands
**And** `editor` value is available to all commands (default: `zed` if absent)

**Given** a config file where the `origins` path does not exist on disk
**When** any command that needs origins starts
**Then** an error is written to stderr: "origins path not found: <path>"
**And** the process exits with code `2`

**Given** `$XDG_CONFIG_HOME` is set in the environment
**When** config is loaded
**Then** config is read from `$XDG_CONFIG_HOME/workhub/config.yaml` instead of `~/.config/workhub/config.yaml`

**Given** `--origins <path>` or `--editor <name>` flags are passed to any command
**When** the command runs
**Then** the flag values override the config file values for that invocation only

---

## Epic 2: Create Workspace

Developer can create a named workspace by selecting repositories from the configured origins root, specifying a branch, generating worktrees across all selected repos, and immediately opening the result in the configured editor.

### Story 2.1: Implement Origins Directory Scanner

As a developer,
I want workhub to automatically discover available repositories from my configured origins root,
So that I can select repositories by name rather than typing full paths.

**Acceptance Criteria:**

**Given** an `origins` directory containing git repositories at depth 1 (e.g. `origins/repo-a/`)
**When** `scanOrigins(originsPath)` is called
**Then** it returns an array of `{ name: string, path: string }` for each git repository found
**And** non-git directories are excluded from the result
**And** the scan completes in under 3 seconds for up to 200 repositories

**Given** the origins directory does not exist
**When** `scanOrigins` is called
**Then** it throws an error with a clear message (caller exits with code 2)

**Given** the origins directory is empty
**When** `scanOrigins` is called
**Then** it returns an empty array (no error)

**Given** the scan runs in unit tests
**When** called with a mock filesystem path
**Then** the function is testable without a real git installation

---

### Story 2.2: Implement Workspace Persistence Layer

As a developer,
I want my workspaces to be saved to and loaded from disk reliably,
So that my working contexts persist across shell sessions and machine restarts.

**Acceptance Criteria:**

**Given** a valid `WorkspaceConfig` object
**When** `saveWorkspace(config)` is called
**Then** a YAML file is written to `~/.config/workhub/workspaces/<name>.yaml`
**And** the write uses atomic strategy: written to `<name>.yaml.tmp` then renamed to `<name>.yaml`
**And** on write failure, the `.tmp` file is deleted and an error is thrown

**Given** a workspace YAML file exists
**When** `loadWorkspace(name)` is called
**Then** it returns a fully typed `WorkspaceConfig` object
**And** `paths` are returned in the order they were saved

**Given** `listWorkspaces()` is called
**When** the workspaces directory contains multiple YAML files
**Then** it returns an array of all workspace names

**Given** a workspace name containing characters other than alphanumeric and hyphens (e.g. `my workspace!`)
**When** `saveWorkspace` is called
**Then** it throws a validation error before any file is written

**Given** the workspaces directory does not exist
**When** `saveWorkspace` is called for the first time
**Then** the directory is created automatically

---

### Story 2.3: Implement Git Worktree Creation

As a developer,
I want workhub to create Git worktrees for selected repositories,
So that I don't need to run `git worktree add` manually for each repository.

**Acceptance Criteria:**

**Given** a repository path, a branch name, and a target worktree path
**When** `createWorktree(repoPath, branch, worktreePath)` is called
**Then** the Git worktree is created at the target path using the specified branch
**And** if the branch does not exist in the repository, it is created from the current HEAD

**Given** the system `git` binary is version < 2.5
**When** the tool starts
**Then** an error is written to stderr: "git 2.5+ required; found: <version>"
**And** the process exits with code `2`

**Given** the repository path is not a git repository
**When** `createWorktree` is called
**Then** it throws a descriptive error (caller reports to user and exits 2)

**Given** the target worktree path already exists
**When** `createWorktree` is called
**Then** it throws an error indicating the path conflict

**Given** all `simple-git` usage
**When** reviewing `src/core/git.ts`
**Then** no `simple-git` imports exist in any other file

---

### Story 2.4: Implement `wh new` — Interactive Workspace Creation

As a developer starting work on a new task,
I want to create a named workspace through a guided interactive flow,
So that I can set up my multi-repo working context without memorizing command syntax.

**Acceptance Criteria:**

**Given** workhub is configured and runs in a TTY
**When** `wh new` is run without arguments
**Then** the user is prompted for: workspace name → repository selection (multi-select from origins scan) → branch name
**And** a preview of all operations is shown before any filesystem action
**And** if the user cancels at any prompt, the process exits with code 1 and no worktrees or workspace files are created

**Given** `wh new ticket-1234 --repo repo-a --repo repo-b --branch feature/x` is run in any environment
**When** all required flags are provided
**Then** no interactive prompts appear
**And** worktrees are created and workspace saved exactly as if the user had answered the prompts with those values

**Given** worktree creation fails for one repository during `wh new`
**When** the error occurs
**Then** the failure is reported to the user immediately
**And** no workspace YAML is written (the incomplete workspace does not silently persist)
**And** the process exits with code 2

**Given** a workspace name is provided that already exists
**When** the name validation runs
**Then** an error is shown asking the user to choose a different name or delete the existing workspace

**Given** the `wh new` flow completes successfully
**When** all worktrees are created and the workspace is saved
**Then** the editor is launched with the workspace (Story 2.5 behavior)
**And** the process exits with code 0

---

### Story 2.5: Implement Editor Launch

As a developer,
I want workhub to open my new workspace in the configured editor immediately after creation,
So that I can start working without any additional steps.

**Acceptance Criteria:**

**Given** a workspace with paths `["/a/worktrees/feat", "/b/worktrees/feat"]`
**When** `openWorkspace(workspace)` is called
**Then** the configured editor is launched as: `<editor> /a/worktrees/feat /b/worktrees/feat`
**And** paths are passed in the order they are stored in the workspace definition

**Given** the configured editor binary (e.g. `zed`) is not found in `PATH`
**When** any command attempts to launch the editor
**Then** an error is written to stderr: "editor not found in PATH: zed"
**And** the process exits with code 2 before any worktree creation or modification occurs

**Given** the editor is successfully launched
**When** `wh new` completes
**Then** the process exits with code 0
**And** the editor process is not waited on (fire-and-forget, editor runs independently)

---

## Epic 3: Open and Inspect Workspaces

Developer can list all persisted workspaces, reopen any workspace in the editor in under 5 seconds, view the git status of all workspace paths, and get clear warnings when paths have become stale.

### Story 3.1: Implement Workspace Listing and Stale Path Detection

As a developer,
I want to see all my workspaces and know which paths still exist on disk,
So that I can make informed decisions before opening or editing them.

**Acceptance Criteria:**

**Given** workspaces exist in `~/.config/workhub/workspaces/`
**When** `listWorkspaces()` is called
**Then** it returns each workspace annotated with stale path flags
**And** a path is marked stale when its directory no longer exists on disk

**Given** `wh open` is run without arguments in a TTY
**When** the workspace selection prompt is shown
**Then** each workspace entry indicates if it has stale paths (e.g. `[1 stale]`)
**And** stale workspaces are still selectable (not blocked)

**Given** no workspaces exist
**When** `wh open` is run
**Then** a clear message is shown: "No workspaces found. Run `wh new` to create one."
**And** the process exits with code 0

---

### Story 3.2: Implement `wh open` — Reopen Workspace in Editor

As a developer returning to an in-progress task,
I want to reopen an existing workspace in my editor with a single command,
So that I can restore my working context instantly without any manual steps.

**Acceptance Criteria:**

**Given** `wh open ticket-1234` is run and the workspace exists
**When** the command runs
**Then** the editor is launched with all persisted paths in persistence order
**And** the command completes (editor launched) in under 5 seconds

**Given** `wh open` is run without a workspace name in a TTY
**When** the command runs
**Then** an interactive list of all workspaces is shown for selection
**And** selecting a workspace launches the editor with its paths

**Given** `wh open ticket-1234` is run and one path is stale
**When** the command runs
**Then** a warning is printed to stderr listing the stale path(s)
**And** the editor is launched with the remaining valid paths (stale paths excluded)
**And** the process exits with code 0

**Given** `wh open ticket-1234` is run and the workspace does not exist
**When** the command runs
**Then** an error is written to stderr: "workspace not found: ticket-1234"
**And** the process exits with code 2

**Given** `wh open ticket-1234` is run in non-TTY mode
**When** the command runs
**Then** no interactive selection appears
**And** the workspace is opened directly (name is required argument in non-TTY)

---

### Story 3.3: Implement Workspace State Display

As a developer,
I want to inspect the state of a workspace including the Git status of each path,
So that I can assess the state of my work before opening or deleting a workspace.

**Acceptance Criteria:**

**Given** `wh open <name> --status` is run
**When** the command executes
**Then** each workspace path is displayed with: existence status, branch name, and dirty/unpushed indicators
**And** the editor is NOT launched
**And** the process exits with code 0

**Given** a workspace path has uncommitted changes
**When** `--status` is displayed
**Then** that path is marked as "dirty" in the output

**Given** a workspace path has unpushed commits
**When** `--status` is displayed
**Then** that path is marked as "unpushed" in the output

**Given** `wh open <name> --status` runs in non-TTY
**When** output is rendered
**Then** output is plain text, one path per line, suitable for scripting

---

## Epic 4: Edit Workspace

Developer can modify an existing workspace by adding a new repository (creating its worktree) or disassociating a repository path (without touching the disk), so the working context can evolve without recreating the entire workspace.

### Story 4.1: Implement `wh edit --add` — Add Repository to Workspace

As a developer mid-task,
I want to add a new repository to my existing workspace,
So that I can expand my working context without recreating everything from scratch.

**Acceptance Criteria:**

**Given** `wh edit ticket-1234 --add repo-d --branch feature/x` is run
**When** the command executes
**Then** a Git worktree is created for `repo-d` using branch `feature/x`
**And** the new path is appended to the workspace's `paths` array
**And** the workspace YAML is updated atomically

**Given** the `--add` flag is used without `--branch`
**When** the command runs
**Then** in TTY mode, the user is prompted for a branch name
**And** in non-TTY mode, an error is written to stderr: "--branch is required" and exits 2

**Given** the specified repository does not exist in the origins directory
**When** `wh edit --add` is run
**Then** an error is written to stderr: "repository not found in origins: <repo>"
**And** the process exits with code 2 without modifying the workspace

**Given** the specified repository is already in the workspace
**When** `wh edit --add` is run
**Then** an error is shown: "repository already in workspace: <repo>"
**And** the process exits with code 2

---

### Story 4.2: Implement `wh edit --remove` — Disassociate Path from Workspace

As a developer,
I want to remove a repository from my workspace without deleting the worktree from disk,
So that I can focus my workspace without losing local changes.

**Acceptance Criteria:**

**Given** `wh edit ticket-1234 --remove repo-b` is run
**When** the command executes
**Then** the path for `repo-b` is removed from the workspace's `paths` array
**And** the worktree directory on disk is NOT deleted
**And** the workspace YAML is updated atomically
**And** a confirmation message is shown: "Removed repo-b from workspace. Worktree at <path> is untouched."

**Given** the specified repository is not in the workspace
**When** `wh edit --remove` is run
**Then** an error is shown: "repository not in workspace: <repo>"
**And** the process exits with code 2

**Given** `wh edit ticket-1234 --remove repo-b` runs in non-TTY mode
**When** the command executes
**Then** no confirmation prompt appears and the operation proceeds directly

---

## Epic 5: Safe Workspace Deletion

Developer can delete a workspace and all its worktrees with a single command, always seeing exactly what will be deleted, and with mandatory protection against removing worktrees that have uncommitted or unpushed work.

### Story 5.1: Implement Git Safety Checks

As a developer,
I want workhub to detect uncommitted changes and unpushed commits in each worktree before any destructive operation,
So that I never accidentally destroy work that hasn't been saved or shared.

**Acceptance Criteria:**

**Given** a worktree path with uncommitted changes
**When** `checkDirty(path)` is called
**Then** it returns `true`

**Given** a worktree path with no uncommitted changes
**When** `checkDirty(path)` is called
**Then** it returns `false`

**Given** a worktree path with unpushed commits (commits ahead of upstream)
**When** `checkUnpushed(path)` is called
**Then** it returns `true`

**Given** a worktree path with no upstream configured
**When** `checkUnpushed(path)` is called
**Then** it returns `false` (no upstream = no risk of losing remote sync)

**Given** a worktree path that no longer exists on disk (stale)
**When** either check is called
**Then** it returns `false` (non-existent paths are not checked)

**Given** safety checks for multiple paths
**When** `runSafetyChecks(paths)` is called
**Then** it returns a map of `{ path → { dirty: boolean, unpushed: boolean } }` for all paths

---

### Story 5.2: Implement Operation Preview and Confirmation

As a developer,
I want to see a formatted list of exactly what workhub will do before it does it and explicitly confirm the operation,
So that I have full control over every destructive action.

**Acceptance Criteria:**

**Given** a set of planned operations (REMOVE worktrees + DELETE workspace YAML)
**When** `printPreview(operations)` is called
**Then** each operation is printed to stdout in the format:
```
The following operations will be performed:
  [REMOVE] /path/to/repo-a/.git/worktrees/feature-x
  [REMOVE] /path/to/repo-b/.git/worktrees/feature-x
  [DELETE] ~/.config/workhub/workspaces/ticket-1234.yaml
```

**Given** a safety check result with at least one dirty or unpushed path
**When** `printSafetyWarning(results)` is called
**Then** each affected path is listed with its status (dirty / unpushed / both)
**And** the output instructs the user to commit or push before retrying

**Given** `--force` is passed and all paths are clean (no dirty, no unpushed)
**When** the confirmation step is reached
**Then** the confirmation prompt is skipped and execution proceeds

**Given** `--force` is passed but one or more paths are dirty or have unpushed commits
**When** the safety check runs
**Then** the operation is blocked with exit code 3 regardless of `--force`
**And** a warning is printed listing the unsafe paths

**Given** the user is prompted for confirmation without `--force`
**When** the user types anything other than the explicit confirmation value
**Then** the operation is cancelled and the process exits with code 1

---

### Story 5.3: Implement `wh delete` — Full Workspace Removal

As a developer who has finished a task,
I want to delete a workspace and all its worktrees in a single command,
So that I can clean up completed work without manually running `git worktree remove` for each repository.

**Acceptance Criteria:**

**Given** `wh delete ticket-1234` is run and all worktrees are clean
**When** the command executes
**Then** safety checks pass for all paths
**And** the operation preview is shown
**And** the user is prompted to confirm
**And** upon confirmation, all worktrees are removed with `git worktree remove <path>`
**And** the workspace YAML at `~/.config/workhub/workspaces/ticket-1234.yaml` is deleted
**And** the process exits with code 0

**Given** `wh delete ticket-1234` is run and one worktree has uncommitted changes
**When** safety checks run
**Then** the warning is printed listing the unsafe path(s)
**And** the operation is blocked and exits with code 3
**And** no worktrees or YAML files are deleted

**Given** `wh delete ticket-1234 --force` is run and all worktrees are clean
**When** the command executes
**Then** safety checks pass, operation preview is shown, confirmation is skipped, and deletion proceeds

**Given** `wh delete ticket-1234 --force` is run and one worktree has unpushed commits
**When** safety checks run
**Then** the operation is still blocked with code 3 (--force does not bypass safety checks)

**Given** the workspace does not exist
**When** `wh delete ticket-1234` is run
**Then** an error is written to stderr: "workspace not found: ticket-1234"
**And** the process exits with code 2

**Given** a worktree removal fails (e.g. git reports an error)
**When** `wh delete` is mid-execution
**Then** the failure is reported immediately
**And** remaining worktrees and the workspace YAML are still processed (best-effort cleanup)
**And** the process exits with code 2

**Given** `wh delete ticket-1234` runs in non-TTY mode without `--force`
**When** the confirmation step is reached
**Then** an error is written to stderr: "use --force to delete non-interactively"
**And** the process exits with code 2
