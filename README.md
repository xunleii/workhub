# workhub

Local-first CLI for managing sets of `git worktree` directories as persistent workspaces.

`workhub` helps you:

- create a workspace from multiple local repositories;
- reopen the same working context in your editor later;
- inspect the Git state of every worktree in a workspace;
- add or remove repositories from an existing workspace;
- safely delete a workspace once the work is done.

## Installation

This project is **not published to npm yet**.

### Install directly from GitHub

```bash
npm install -g https://github.com/xunleii/workhub/releases/download/v0.1.0/workhub-0.1.0.tgz
```

### Install from a local checkout

```bash
git clone <your-repo-url> workhub
cd workhub
npm install
npm run build
npm link
```

After that, the `wh` command is available in your shell:

```bash
wh --help
```

### Alternative: install globally from the current checkout

```bash
git clone <your-repo-url> workhub
cd workhub
npm install
npm run build
npm install -g .
```

### Note about `npm install -g git+https://...`

Direct global installation from a Git URL is not the recommended path yet. On some npm setups it can fail during dependency preparation or leave a broken global package link, so the supported installation flows are:

1. install the GitHub release tarball;
2. or clone the repository, run `npm install`, `npm run build`, then use `npm link` or `npm install -g .`.

### During development without a global install

```bash
npm install
npm run build
node dist/index.js --help
```

## Requirements

- **Node.js 24+**
- **Git 2.5+**
- a local `origins` directory containing the source repositories you want to work from

## Features

- **Simple bootstrap**: local YAML config with `origins` and a default editor.
- **Persistent workspaces**: one YAML manifest per workspace.
- **Fast reopen**: `wh open <name>` opens all valid workspace paths in your editor.
- **Git inspection**: `wh open <name> --status` shows branch, dirty/unpushed state, and stale paths.
- **Incremental edits**: `wh edit --add` and `wh edit --remove`.
- **Safe deletion**: operation preview, explicit confirmation, and Git safety blocking for dirty/unpushed worktrees.
- **Autocompletion**:
  - interactive path selection via `@clack/prompts.path()` for `origins`;
  - completion scripts for **bash**, **zsh**, and **fish**;
  - directory completion for `--origins`;
  - workspace-name completion for `open`, `edit`, and `delete`.

## First run

On first launch, workhub creates its config file at:

- `${XDG_CONFIG_HOME}/workhub/config.yaml`, or
- `~/.config/workhub/config.yaml`

In TTY mode, `origins` is collected with a path-aware prompt that supports directory navigation and completion.

Example config:

```yaml
origins: /Users/alice/code/origins
editor: zed
```

In non-interactive mode:

```bash
wh --origins /Users/alice/code/origins --editor zed --help
```

## Recommended workflow

### 1. Create a workspace

```bash
wh new ticket-1234 --repo api --repo web --branch feature/ticket-1234
```

This:

1. creates worktrees under `<origin>/.git/worktrees/<workspace>/<repo>`;
2. writes the workspace YAML manifest;
3. opens the workspace in the configured editor unless `--no-open` is used.

### 2. Reopen a workspace

```bash
wh open ticket-1234
```

Without a name, `wh open` shows an interactive workspace list in TTY mode.

### 3. Inspect Git status

```bash
wh open ticket-1234 --status
```

TTY output is human-friendly.  
Non-TTY output is tab-separated, one path per line.

### 4. Add a repository to a workspace

```bash
wh edit ticket-1234 --add docs --branch feature/ticket-1234
```

### 5. Remove a repository from a workspace

```bash
wh edit ticket-1234 --remove docs
```

This does **not** delete the worktree on disk. It only updates the workspace manifest.

### 6. Delete a workspace

```bash
wh delete ticket-1234
```

The delete flow:

1. runs Git safety checks;
2. prints the planned operations;
3. asks for confirmation;
4. removes worktrees and then deletes the workspace manifest.

For non-interactive usage:

```bash
wh delete ticket-1234 --force
```

`--force` **does not bypass safety checks**. It only skips the confirmation prompt when every path is safe.

## Quick reference

| Command | Purpose |
| --- | --- |
| `wh new [name]` | create a new workspace |
| `wh open [name]` | open an existing workspace |
| `wh open [name] --status` | show Git state for the workspace |
| `wh edit <name> --add <repo> --branch <branch>` | add a repository to a workspace |
| `wh edit <name> --remove <repo>` | remove a repository from a workspace without touching disk |
| `wh delete <name> [--force]` | delete a workspace and its worktrees |
| `wh completion <shell>` | print a shell completion script |

## Shell completion

### Bash

```bash
mkdir -p ~/.local/share/bash-completion/completions
wh completion bash > ~/.local/share/bash-completion/completions/wh
```

Or from the project itself:

```bash
npm run build
npm run completion:bash > ~/.local/share/bash-completion/completions/wh
```

### Zsh

```bash
mkdir -p ~/.zfunc
wh completion zsh > ~/.zfunc/_wh
```

Then add `~/.zfunc` to `fpath` if your shell config does not already include it.

### Fish

```bash
mkdir -p ~/.config/fish/completions
wh completion fish > ~/.config/fish/completions/wh.fish
```

## Local storage

### Config

```text
${XDG_CONFIG_HOME:-~/.config}/workhub/config.yaml
```

### Workspaces

```text
${XDG_CONFIG_HOME:-~/.config}/workhub/workspaces/<workspace>.yaml
```

Example:

```yaml
name: ticket-1234
branch: feature/ticket-1234
created_at: 2026-04-28T12:00:00.000Z
paths:
  - repo: api
    path: /Users/alice/code/origins/api/.git/worktrees/ticket-1234/api
  - repo: web
    path: /Users/alice/code/origins/web/.git/worktrees/ticket-1234/web
```

## Development

```bash
npm install
npm run build
npm test
```

The project uses:

- `commander` for the CLI surface;
- `@clack/prompts` for interactive flows;
- `simple-git` for Git operations;
- `vitest` for tests;
- TypeScript ESM with `module: NodeNext`.
