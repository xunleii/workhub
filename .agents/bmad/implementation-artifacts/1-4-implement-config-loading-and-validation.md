# Story 1.4: Implement Config Loading and Validation

Status: review

## Story

As a developer,
I want workhub to load and validate my configuration on each run,
so that misconfigured installations fail with clear errors instead of mysterious behavior.

## Acceptance Criteria

1. **Given** a valid config file at `~/.config/workhub/config.yaml` **When** any command starts **Then** config is loaded and `origins` path is available to all commands **And** `editor` value is available to all commands (default: `zed` if absent).
2. **Given** a config file where the `origins` path does not exist on disk **When** any command that needs origins starts **Then** an error is written to stderr: "origins path not found: <path>" **And** the process exits with code `2`.
3. **Given** `$XDG_CONFIG_HOME` is set in the environment **When** config is loaded **Then** config is read from `$XDG_CONFIG_HOME/workhub/config.yaml` instead of `~/.config/workhub/config.yaml`.
4. **Given** `--origins <path>` or `--editor <name>` flags are passed to any command **When** the command runs **Then** the flag values override the config file values for that invocation only.

## Tasks / Subtasks

- [x] Task 1: Implement `loadConfig()` in `src/core/config.ts` (AC: #1, #3)
  - [x] Read the YAML file at `resolveConfigPath()` using `js-yaml`
  - [x] Return `AppConfig` with `editor` defaulting to `'zed'` if not present in file
  - [x] Throw a descriptive error if the config file does not exist (caller handles exit code)

- [x] Task 2: Implement `validateConfig()` in `src/core/config.ts` (AC: #2)
  - [x] Check that `config.origins` directory exists on disk using `fs/promises.access`
  - [x] If not found: call `printError(`origins path not found: ${config.origins}`)` and `exitWithCode(ExitCode.ToolError)`

- [x] Task 3: Wire `loadConfig` + `validateConfig` into `src/index.ts` (AC: #1, #4)
  - [x] After first-run setup (Story 1.3) or when config already exists, call `loadConfig()`
  - [x] Apply `--origins` / `--editor` flag overrides to the loaded config
  - [x] Call `validateConfig()` before dispatching to any command
  - [x] Pass the final `AppConfig` to commands via Commander's option inheritance or a module-level store

- [x] Task 4: Write unit tests (AC: #1, #2, #3, #4)
  - [x] Test: `loadConfig` returns correct AppConfig from a valid YAML file
  - [x] Test: `loadConfig` defaults `editor` to `'zed'` when field is absent
  - [x] Test: `loadConfig` throws when config file does not exist
  - [x] Test: `resolveConfigPath` uses `XDG_CONFIG_HOME` when set (from Story 1.3 — verify it works end-to-end)

## Dev Notes

### Story dependencies

- Story 1.3 added `resolveConfigPath()`, `configExists()`, `saveConfig()` to `src/core/config.ts`. This story **adds** `loadConfig()` and `validateConfig()` to the same file. Do not rewrite the existing functions.
- `printError` and `exitWithCode` are in `src/ui/output.ts` (Story 1.2).

### `loadConfig()` implementation

```typescript
export async function loadConfig(): Promise<AppConfig> {
  const configPath = resolveConfigPath();
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    throw new Error(`Config file not found at ${configPath}. Run 'wh new' to set up.`);
  }
  const parsed = yaml.load(raw) as Partial<AppConfig>;
  return {
    origins: parsed?.origins ?? '',
    editor: parsed?.editor ?? 'zed',
  };
}
```

### `validateConfig()` implementation

```typescript
import { printError, exitWithCode } from '../ui/output.js';
import { ExitCode } from '../types.js';

export async function validateConfig(config: AppConfig): Promise<void> {
  try {
    await access(config.origins);
  } catch {
    printError(`origins path not found: ${config.origins}`);
    exitWithCode(ExitCode.ToolError);
  }
}
```

**Note:** `validateConfig` imports from `../ui/output.js`. This is the only cross-boundary import allowed in `src/core/` — it's for exiting with a formatted error, not for prompts. All other core modules also follow this pattern for fatal error reporting.

### Passing config to commands — module-level store pattern

Commander.js does not have a native DI system. The simplest approach for this single-developer CLI is a module-level config store:

```typescript
// src/core/config.ts — add at bottom
let _config: AppConfig | null = null;

export function setActiveConfig(config: AppConfig): void {
  _config = config;
}

export function getActiveConfig(): AppConfig {
  if (!_config) throw new Error('Config not loaded. Call setActiveConfig first.');
  return _config;
}
```

In `src/index.ts`:

```typescript
const config = await loadConfig();
applyFlagOverrides(config, program.opts()); // mutates config with --origins/--editor
await validateConfig(config);
setActiveConfig(config);
// then program.parse() dispatches to commands
```

Command files call `getActiveConfig()` to access the config. No prop-drilling through Commander arguments.

### Flag overrides — apply before validateConfig

```typescript
function applyFlagOverrides(config: AppConfig, opts: { origins?: string; editor?: string }): void {
  if (opts.origins) config.origins = opts.origins;
  if (opts.editor) config.editor = opts.editor;
}
```

The override is in-memory only — does not write back to the config file (AC #4: "for that invocation only").

### Handling the `loadConfig` error in index.ts

If `loadConfig` throws (config file missing but `configExists` said it was there), treat as a tool error:

```typescript
try {
  const config = await loadConfig();
  // ...
} catch (err) {
  printError((err as Error).message);
  exitWithCode(ExitCode.ToolError);
}
```

### Test isolation — avoid real filesystem

Use `os.tmpdir()` and write a temporary `config.yaml` in tests. Restore `process.env.XDG_CONFIG_HOME` after each test that modifies it.

```typescript
afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
});
```

### References

- [Source: .agents/bmad/planning-artifacts/architecture.md#Data Architecture]
- [Source: .agents/bmad/planning-artifacts/architecture.md#Config file location]
- [Source: .agents/bmad/planning-artifacts/epics.md#Story 1.4]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Red phase: `npm test -- --run tests/unit/core/config.test.ts` failed before implementation because `loadConfig` was missing from `src/core/config.ts`.
- Validation commands: `npm run build`, `npm test`.
- Manual CLI validation: verified that `--origins/--editor` override the loaded config for a single invocation without rewriting `config.yaml`, and verified invalid configured origins exit with code 2 and a stderr error.

### Completion Notes List

- Added `loadConfig`, `validateConfig`, `setActiveConfig`, and `getActiveConfig` to `src/core/config.ts` while preserving the Story 1.3 APIs.
- Wired config loading, per-invocation flag overrides, validation, and active-config registration into `src/index.ts` before command dispatch.
- Extended unit coverage for config loading/defaulting/missing-file behavior and validated override plus invalid-origins CLI flows end-to-end.

### File List

- .agents/bmad/implementation-artifacts/1-4-implement-config-loading-and-validation.md
- .agents/bmad/implementation-artifacts/sprint-status.yaml
- src/core/config.ts
- src/index.ts
- tests/unit/core/config.test.ts

## Change Log

- 2026-04-28: Implemented config loading/validation, registered the active config for command access, and verified override plus invalid-config startup behavior.
