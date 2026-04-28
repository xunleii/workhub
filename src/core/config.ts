import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { ExitCode, type AppConfig } from '../types.js';
import { exitWithCode, printError } from '../ui/output.js';

export function resolveConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const baseDirectory = xdgConfigHome ?? join(homedir(), '.config');

  return join(baseDirectory, 'workhub', 'config.yaml');
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

export async function validateConfig(config: AppConfig): Promise<void> {
  try {
    await access(config.origins);
  } catch {
    printError(`origins path not found: ${config.origins}`);
    exitWithCode(ExitCode.ToolError);
  }
}

let activeConfig: AppConfig | null = null;

export function setActiveConfig(config: AppConfig): void {
  activeConfig = config;
}

export function getActiveConfig(): AppConfig {
  if (!activeConfig) {
    throw new Error('Config not loaded. Call setActiveConfig first.');
  }

  return activeConfig;
}
