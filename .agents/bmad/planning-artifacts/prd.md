---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
releaseMode: phased
inputDocuments:
  - DRAFT.md
  - .agents/bmad/brainstorming/brainstorming-session-2026-04-27-19-17-22.md
workflowType: 'prd'
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 0
classification:
  projectType: cli_tool
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document — workhub

**Author:** xunleii
**Date:** 2026-04-27

## Executive Summary

Workhub is a local-first CLI tool for developers who regularly switch between multi-repository tasks and need to restore a coherent working context quickly. It solves a practical but repetitive workflow problem: creating the right Git worktrees in the right places, grouping them into a persistent workspace, and reopening that workspace in Zed without repeating setup steps repository by repository.

The product is designed around a single core object: the workspace. A workspace is a named, persistent set of local project paths representing a reusable development context. Users create a workspace by selecting repositories from a configured `origins` root, applying a shared branch name, generating the required worktrees, and immediately opening the result in Zed. The primary value is not Git automation; it is fast, repeatable recovery of a development context that would otherwise be rebuilt manually each time.

The scope is intentionally narrow. Workhub does not attempt to be a ticketing layer, repository manager, or generic orchestrator. Its job is to make local multi-repo worktree setup and workspace reopening simple, explicit, and reliable.

### What Makes This Special

Workhub combines three things usually fragmented across ad hoc scripts and manual habits: structured worktree creation, persistent workspace memory, and one-step editor reopening. The real user need is not "create a worktree faster" — it is "restore my exact working context instantly." Workhub treats that context as a first-class product concept rather than leaving it spread across shell history and editor state.

The interaction model reinforces this: interactive by default, fully scriptable via flags. The same command feels like a TUI for daily use and a deterministic primitive in scripts. Destructive operations are explicit and trustworthy, with mandatory warnings on dirty or unpushed worktrees — the tool builds confidence rather than filesystem anxiety.

**Project type:** CLI tool — greenfield, low domain complexity, single developer, no external service dependencies.

## Success Criteria

### User Success

- A developer opens an existing workspace in under 5 seconds from `wh open` invocation to Zed rendering the correct project set.
- A developer creates a new workspace (worktree creation + path persistence + Zed launch) in under 60 seconds, replacing a manual process that takes 5+ minutes.
- A developer switches between working contexts daily without rebuilding any setup manually.
- A developer always sees an explicit preview of filesystem and Git operations before they execute.

### Business Success

- The tool replaces all manual context-switching overhead for the primary developer within the first week of use.
- Daily active use sustained after the first month without friction forcing a return to manual workflows.

### Technical Success

- All four core commands (`wh new`, `wh open`, `wh edit`, `wh delete`) function correctly and completely.
- All destructive operations surface dirty/unpushed worktree warnings before execution; zero silent data loss.
- All commands are fully scriptable via flags with no interactive prompts required when flags are provided.
- Workspace state persists correctly across shell sessions and machine restarts.

### Measurable Outcomes

- `wh open` → Zed launch: < 5 seconds.
- `wh new` full interactive flow: < 60 seconds.
- Manual context-switching time: reduced from ~5 minutes to under 1 minute.
- Zero data loss incidents from silent destructive operations.

## Product Scope

### MVP Strategy

All four commands ship together as the MVP. A partial release (e.g., only `new` and `open`) would leave users unable to clean up workspaces, creating filesystem anxiety — the opposite of the product's trust guarantee. The MVP is complete when all four commands work correctly, safely, and with full flag coverage.

**Implementation:** Single developer. Local toolchain: Node.js CLI with interactive TUI prompts, local config/workspace storage. No network access, no external services.

### MVP — Minimum Viable Product

- `wh new`: interactive workspace creation — repository selection, branch input, worktree generation, Zed launch.
- `wh open`: one-command workspace reopening, faithful to persisted path order.
- `wh edit`: modify workspace content (add/remove repositories) via action flags.
- `wh delete`: destroy workspace and all associated worktrees, with Git safety checks and explicit confirmation.
- Interactive TUI by default; all prompts replaceable by flags.
- Explicit operation preview before any filesystem or Git action executes.
- Workspace persistence under `~/.config/workhub/`.

### Growth Features (Post-MVP)

- Automatic discovery and import of existing local worktrees.
- Multiple `origins` roots.
- Workspace metadata (notes, last-opened date, tags).
- Shell completions for workspace and repository names.

### Vision (Future)

- Ticket system integration (Jira, Linear, GitHub Issues) to seed workspace creation.
- Team workspace templates shared via dotfiles or config repo.
- Editor agnosticism beyond Zed.

### Risk Mitigation

**Technical:**
- Zed CLI behavior may vary across versions. Mitigation: detect `zed` binary availability before launch; surface a clear error rather than silently failing.
- Worktree creation can fail mid-sequence for multi-repo workspaces. Mitigation: report partial failure clearly; never persist an incomplete workspace as complete.

**Adoption:**
- TUI latency could make the tool slower than manual setup. Mitigation: filesystem and Git operations must not block TUI renders; use concurrent execution where possible.

## User Journeys

### Journey 1: Developer Creates a New Workspace (Primary — Happy Path)

A developer starts work on a ticket spanning three repositories. He runs `wh new`. Workhub prompts for a workspace name, scans `origins`, and presents available repositories. He selects three with arrow keys and confirms. Workhub prompts for a branch name; he types `feature/new-api`. Workhub creates the three worktrees, persists the workspace, and launches Zed with all three folders — in under 60 seconds.

Previously: `cd` to each repo, `git worktree add`, repeat, drag folders into Zed. Five minutes minimum.

**Capabilities:** repository discovery from origins, interactive multi-repo selection, shared branch creation, worktree generation, workspace persistence, Zed launch.

### Journey 2: Developer Reopens an Existing Workspace (Primary — Return Visit)

Three days later, the developer types `wh open`. Workhub lists his workspaces. He selects the target. Within 5 seconds, Zed opens with the same three projects in the same order. No reconstruction.

**Capabilities:** workspace listing, path validation, Zed relaunch from persisted state.

### Journey 3: First-Time Configuration

The developer has just installed workhub. He runs `wh new` for the first time. Workhub detects no configuration and prompts for the `origins` root. He provides the path. Config saved. Proceeds normally.

**Capabilities:** first-run detection, guided origins setup, config persistence.

### Journey 4: Developer Deletes a Completed Workspace (Destructive — Safe Path)

After merging, the developer runs `wh delete ticket-1234`. Workhub checks each worktree: one has uncommitted changes, another has unpushed commits. A clear summary lists each path and its Git status. The developer confirms by typing `yes`. Workhub removes the three worktrees and deletes the workspace entry. No surprises.

**Capabilities:** Git safety checks per worktree, dirty/unpushed detection, operation preview, explicit confirmation, worktree removal, workspace config cleanup.

### Journey 5: Developer Adds a Repository to an Existing Workspace

Midway through a ticket, the developer realizes he needs a fourth repository. He runs `wh edit ticket-1234 --add repo-d --branch feature/new-api`. Workhub creates the new worktree, adds the path to the workspace, and confirms the update.

**Capabilities:** add/remove repository paths from an existing workspace, single worktree creation within edit flow, persistence update.

### Journey Requirements Summary

| Journey | Core Capabilities |
|---|---|
| Create workspace | Origins scan, repo selection, branch input, worktree creation, persistence, Zed launch |
| Reopen workspace | Workspace listing, path validation, Zed relaunch |
| First-time setup | Config detection, guided onboarding, origins config |
| Delete workspace | Git safety checks, operation preview, explicit confirmation, worktree removal |
| Edit workspace | Add/remove paths, individual worktree operations, persistence update |

## Innovation & Novel Patterns

### Detected Innovation

Workhub's primary innovation is treating the developer workspace as a first-class, persistent, named object rather than an ephemeral by-product of shell commands. This shifts the mental model from "directories I happened to create" to "a reusable context I can restore on demand."

The second innovation is the full prompt-to-flag correspondence: every interactive prompt has an exact flag equivalent. Most developer tools choose interactive or scriptable; workhub makes both mandatory. This guarantees the tool serves daily manual use and deterministic automation equally well.

### Market Context

The problem space is currently served by ad hoc shell scripts, tmux session managers, and editor workspace features. None provide a unified model covering worktree creation, multi-repo grouping, persistence, and editor launch in a single restorable object. Workhub fills this gap without displacing any existing primitive.

### Validation Approach

Primary validation: daily personal use eliminates the 5-minute manual setup within the first week. Secondary validation: workspace state survives restarts and context switches without corruption.

## CLI Tool Specific Requirements

### Command Structure

| Command | Syntax | Default Mode |
|---|---|---|
| Create workspace | `wh new [name] [--repo <r>]... [--branch <b>]` | Interactive, fully flaggable |
| Open workspace | `wh open [name]` | Interactive selection if name omitted |
| Edit workspace | `wh edit <name> [--add <r>] [--remove <r>]` | Flag-driven |
| Delete workspace | `wh delete <name> [--force]` | Interactive confirmation |

Flag precedence: explicit flags > interactive prompts. When all required flags are supplied, no prompts appear. `--force` on `wh delete` skips the confirmation prompt only when no dirty or unpushed state is detected.

### Output Formats

- **Interactive (TTY):** TUI with list pickers, status spinners, and confirmation dialogs.
- **Scriptable (non-TTY or `--no-interactive`):** Clean line-based stdout; errors to stderr.
- **Color:** Disabled when `NO_COLOR=1` is set or stdout is not a TTY.

### Configuration Schema

- **Config file:** `~/.config/workhub/config.yaml`
- **Key fields:** `origins` (path to repository root directory), `editor` (default: `zed`)
- **Workspace store:** `~/.config/workhub/workspaces/<name>.yaml` — one file per workspace
- **Workspace fields:** `name`, `paths` (ordered list of worktree paths), `branch`, `created_at`

### Scripting Support

- All four commands operable via flags only; zero interactive prompts when flags cover all required inputs.
- Exit codes: `0` success, `1` user abort, `2` tool error, `3` Git safety check blocked the operation.
- Workspace paths always output in persistence order for deterministic scripting.

## Functional Requirements

### Workspace Management

- FR1: Developer can create a named workspace by selecting repositories and specifying a shared branch name.
- FR2: Developer can reopen an existing workspace by name, launching the configured editor with the workspace's persisted paths.
- FR3: Developer can list all persisted workspaces.
- FR4: Developer can add a repository to an existing workspace.
- FR5: Developer can remove a repository path from an existing workspace without deleting the underlying worktree from disk.
- FR6: Developer can delete a workspace and all its associated worktrees from disk.
- FR7: Developer can view the current state of a workspace, including all paths and their Git status.

### Repository Discovery

- FR8: Developer can browse repositories discovered from the configured origins root.
- FR9: The tool scans the origins directory automatically to populate the repository selection list.
- FR10: Developer can configure the origins root directory via a persistent config file.
- FR11: Developer can configure the default editor via a persistent config file.

### Worktree Operations

- FR12: The tool creates Git worktrees for all selected repositories using the specified branch name.
- FR13: The tool creates the specified branch in a repository if it does not already exist.
- FR14: The tool removes Git worktrees from disk when a workspace or individual path is deleted.
- FR15: The tool detects and reports stale workspace paths where the worktree directory no longer exists on disk.

### Safety & Confirmation

- FR16: The tool checks each worktree for uncommitted changes before any destructive operation.
- FR17: The tool checks each worktree for unpushed commits before any destructive operation.
- FR18: The tool displays an explicit preview of all filesystem and Git operations before executing them.
- FR19: The tool requires explicit user confirmation before executing any destructive operation.
- FR20: Developer can bypass the interactive confirmation prompt via an explicit flag, provided no dirty or unpushed state is detected.

### Editor Integration

- FR21: The tool launches the configured editor with all workspace paths provided as project folders.
- FR22: The tool opens workspace paths in the order they are stored in the workspace definition.
- FR23: The tool validates that the configured editor binary is available before attempting to launch it.

### CLI Interaction

- FR24: Developer can complete all operations using command-line flags only, without interactive prompts.
- FR25: The tool operates in TUI mode when run in a TTY without full flag coverage.
- FR26: The tool suppresses interactive elements and color output in non-TTY environments.
- FR27: The tool returns structured exit codes distinguishing success, user abort, tool error, and Git safety block.
- FR28: The tool guides first-time users through initial configuration on first run when no config file exists.

## Non-Functional Requirements

### Performance

- `wh open` completes from invocation to editor launch in under 5 seconds for a workspace with up to 10 paths on a standard developer laptop.
- `wh new` full interactive flow completes in under 60 seconds for up to 10 repositories.
- Origins directory scan for up to 200 repositories completes in under 3 seconds.

### Reliability

- Workspace state is never silently corrupted; any write failure is reported with the pre-operation state preserved.
- Worktree creation failures during `wh new` are reported clearly; no partial workspace is silently persisted as complete.
- The tool operates correctly on macOS and Linux.

### Integration

- Git integration uses the system `git` binary; minimum required version is Git 2.5 (worktree support).
- Editor integration uses the configured editor's CLI command; default is `zed`.
- The tool requires no network access and no remote service in the MVP.
