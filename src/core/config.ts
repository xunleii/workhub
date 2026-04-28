import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';

import type { AppConfig } from '../types.js';

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
