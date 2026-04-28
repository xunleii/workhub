# Story 1.3: Implement First-Run Configuration Setup

Status: ready-for-dev

## Story

As a developer using workhub for the first time,
I want to be guided through configuring the origins root and default editor,
so that I can start using the tool without reading documentation.

## Acceptance Criteria

1. **Given** no config file exists at `~/.config/workhub/config.yaml` **When** `wh new` (or any command) is run **Then** a welcome intro is displayed via `@clack/prompts` **And** the user is prompted for the `origins` root directory path **And** the user is prompted for the default editor (default: `zed`) **And** the provided paths are validated (origins directory must exist) **And** config is saved to `~/.config/workhub/config.yaml` **And** the original command continues after setup completes.
2. **Given** no config file exists and the tool runs in non-TTY mode **When** `wh new --origins /path/to/repos --editor zed` is executed **Then** first-run setup completes without interactive prompts using the flag values **And** config is saved and the command continues.
3. **Given** a config file already exists **When** any command runs **Then** first-run setup is skipped entirely.
4. **Given** the user cancels first-run setup **When** the process exits **Then** exit code is `1` and no config file is written.
5. **Given** an invalid origins path is provided **When** setup validates it **Then** an error is shown and the prompt repeats (or exits 2 in non-TTY).

## Tasks / Subtasks

- [ ] Task 1: Implement config path resolution in `src/core/config.ts` (AC: #1, #2, #3)
  - [ ] Implement `resolveConfigPath(): string` — returns `$XDG_CONFIG_HOME/workhub/config.yaml` or `~/.config/workhub/config.yaml`
  - [ ] Implement `configExists(): Promise<boolean>` — checks if config file exists on disk
  - [ ] Implement `saveConfig(config: AppConfig): Promise<void>` — writes YAML to config path, creates directory if absent

- [ ] Task 2: Implement first-run prompts in `src/ui/prompts.ts` (AC: #1, #4, #5)
  - [ ] Implement `runFirstRunSetup(overrides?: { origins?: string; editor?: string }): Promise<AppConfig>` — full @clack/prompts flow for first-run
  - [ ] Show `clack.intro()` welcome message
  - [ ] Prompt for `origins` path with validation (directory must exist)
  - [ ] Prompt for editor with default `'zed'` using `clack.text({ initialValue: 'zed' })`
  - [ ] Check `clack.isCancel()` after each prompt — call `clack.cancel()` and exit 1 if cancelled
  - [ ] If `overrides` are provided and non-TTY, skip prompts and use override values directly

- [ ] Task 3: Wire first-run detection into `src/index.ts` (AC: #1, #2, #3)
  - [ ] Before parsing the command, call `configExists()`
  - [ ] If config does not exist, call `runFirstRunSetup(overrides)` to collect config
  - [ ] Call `saveConfig(config)` with the result
  - [ ] Pass the loaded/created config to the command pipeline

- [ ] Task 4: Write unit tests (AC: #3, #4, #5)
  - [ ] Test: `resolveConfigPath` returns XDG path when `XDG_CONFIG_HOME` is set
  - [ ] Test: `resolveConfigPath` returns `~/.config/...` when `XDG_CONFIG_HOME` is not set
  - [ ] Test: `saveConfig` creates directory and writes correct YAML
  - [ ] Test: `configExists` returns false when file missing, true when present

## Dev Notes

### Story dependencies

- Story 1.1: `src/core/config.ts` exists as an empty stub — implement it here.
- Story 1.2: `isTTY`, `exitWithCode`, `printError` are available from `src/ui/output.ts`.
- Story 1.4 (next): Will add `loadConfig()` and `validateConfig()` to `src/core/config.ts`. Do not implement those here — only `resolveConfigPath`, `configExists`, `saveConfig`.

### `src/core/config.ts` — functions for this story

```typescript
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import type { AppConfig } from '../types.js';

export function resolveConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg ?? join(homedir(), '.config');
  return join(base, 'workhub', 'config.yaml');
}

export async function configExists(): Promise<boolean> {
  try {
    await access(resolveConfigPath());
    return true;
  } catch {
    return false;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = resolveConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, yaml.dump(config), 'utf8');
}
```

`js-yaml` is imported as a default import (`import yaml from 'js-yaml'`). With TypeScript NodeNext + `"esModuleInterop": true`, this works correctly.

### `src/ui/prompts.ts` — first-run setup function

```typescript
import * as clack from '@clack/prompts';
import { access } from 'fs/promises';
import { isTTY, exitWithCode, printError } from './output.js';
import { ExitCode } from '../types.js';
import type { AppConfig } from '../types.js';

export async function runFirstRunSetup(overrides?: {
  origins?: string;
  editor?: string;
}): Promise<AppConfig> {
  // Non-TTY + flags provided: skip all prompts
  if (!isTTY && overrides?.origins) {
    return {
      origins: overrides.origins,
      editor: overrides.editor ?? 'zed',
    };
  }

  if (!isTTY && !overrides?.origins) {
    printError('No config found. In non-TTY mode, provide --origins and --editor flags.');
    exitWithCode(ExitCode.ToolError);
  }

  clack.intro('Welcome to workhub — local-first Git workspace manager');

  const origins = await clack.text({
    message: 'Path to your repositories root directory (origins):',
    initialValue: overrides?.origins ?? '',
    validate: async (value) => {
      if (!value.trim()) return 'Path is required';
      try {
        await access(value.trim());
      } catch {
        return `Directory not found: ${value.trim()}`;
      }
    },
  });
  if (clack.isCancel(origins)) {
    clack.cancel('Setup cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  const editor = await clack.text({
    message: 'Default editor command:',
    initialValue: overrides?.editor ?? 'zed',
  });
  if (clack.isCancel(editor)) {
    clack.cancel('Setup cancelled.');
    exitWithCode(ExitCode.UserAbort);
  }

  clack.outro('Configuration saved. Continuing...');

  return {
    origins: (origins as string).trim(),
    editor: (editor as string).trim() || 'zed',
  };
}
```

### Casting after `isCancel` check

After `clack.isCancel(origins)` returns false, TypeScript still types `origins` as `string | symbol`. Cast to `string` with `origins as string` only after the `isCancel` guard.

### Non-TTY behavior for first-run (AC #2)

The `--origins` and `--editor` flags are global options on the Commander program. In `src/index.ts`, parse these before running first-run setup:

```typescript
// src/index.ts
program.option('--origins <path>', 'origins directory (overrides config)');
program.option('--editor <name>', 'editor binary (overrides config)');

// Before command dispatch:
const opts = program.opts<{ origins?: string; editor?: string }>();
if (!(await configExists())) {
  const config = await runFirstRunSetup(opts);
  await saveConfig(config);
}
```

### Origins path validation

The `validate` function in `clack.text` must be **async** to call `access()`. The `@clack/prompts` 1.2.0 API supports async validate functions — a non-empty string return value shows as an error and re-prompts.

### Config YAML format — must match schema

`saveConfig` must write YAML matching the exact schema:

```yaml
origins: /path/to/repos
editor: zed
```

`js-yaml`'s `yaml.dump()` produces this correctly from `{ origins, editor }`. Do not use `JSON.stringify`.

### `configExists` vs `loadConfig` (Story 1.4)

- `configExists()`: only checks presence — used for first-run detection
- `loadConfig()` (Story 1.4): reads and parses the file — used by all commands to get the config

Do not combine them. `configExists` is O(1) filesystem check; `loadConfig` parses YAML.

### Test file location

```
tests/unit/core/config.test.ts   ← already exists as empty dir from Story 1.1
```

Use `os.tmpdir()` + unique subfolder for test config files. Clean up in `afterEach`.

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Architecture]
- [Source: .agents/bmad/planning-artifacts/architecture.md#First-run flow]
- [Source: .agents/bmad/planning-artifacts/architecture.md#@clack/prompts cancel handling]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 1.3]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
