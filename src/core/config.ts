import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { ExitCode, type AppConfig } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

/**
 * Resolves the absolute path of the user configuration file.
 *
 * The config lives in XDG config storage when available and falls back to the
 * conventional `~/.config/workhub/config.yaml` location otherwise.
 *
 * @returns Absolute filesystem path to `config.yaml`.
 */
export function resolveConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const baseDirectory = xdgConfigHome ?? join(homedir(), '.config');

  return join(baseDirectory, 'workhub', 'config.yaml');
}

/**
 * Checks whether the persisted user configuration already exists.
 *
 * @returns `true` when the config file is present on disk.
 */
export async function configExists(): Promise<boolean> {
  try {
    await access(resolveConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Persists the application configuration to disk.
 *
 * @param config - Configuration values to serialize as YAML.
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = resolveConfigPath();

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, yaml.dump(config), 'utf8');
}

/**
 * Loads the application configuration from disk and normalizes default values.
 *
 * @returns Parsed configuration ready to be validated.
 * @throws {Error} When the configuration file is missing.
 */
export async function loadConfig(): Promise<AppConfig> {
  const configPath = resolveConfigPath();
  let rawConfig: string;

  try {
    rawConfig = await readFile(configPath, 'utf8');
  } catch {
    throw new Error(`Config file not found at ${configPath}. Run 'wh new' to set up.`);
  }

  const parsedConfig = yaml.load(rawConfig) as Partial<AppConfig> | undefined;

  return {
    origins: parsedConfig?.origins ?? '',
    editor: parsedConfig?.editor ?? 'zed',
  };
}

/**
 * Validates runtime configuration before commands are allowed to execute.
 *
 * @param config - Configuration object to validate.
 */
export async function validateConfig(config: AppConfig): Promise<void> {
  try {
    await access(config.origins);
  } catch {
    printError(`origins path not found: ${config.origins}`);
    exitWithCode(ExitCode.ToolError);
  }
}

let activeConfig: AppConfig | null = null;

/**
 * Stores the validated configuration in module state for later command access.
 *
 * @param config - Runtime configuration to expose to command handlers.
 */
export function setActiveConfig(config: AppConfig): void {
  activeConfig = config;
}

/**
 * Returns the validated configuration currently active for the process.
 *
 * @returns Active runtime configuration.
 * @throws {Error} When configuration has not been initialized yet.
 */
export function getActiveConfig(): AppConfig {
  if (!activeConfig) {
    throw new Error('Config not loaded. Call setActiveConfig first.');
  }

  return activeConfig;
}
