import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { configExists, resolveConfigPath, saveConfig } from '../../../src/core/config.js';

const createdDirectories: string[] = [];

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME;

  await Promise.all(
    createdDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('src/core/config', () => {
  it('resolveConfigPath returns XDG path when XDG_CONFIG_HOME is set', async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-xdg-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    expect(resolveConfigPath()).toBe(join(xdgDirectory, 'workhub', 'config.yaml'));
  });

  it('resolveConfigPath returns ~/.config path when XDG_CONFIG_HOME is not set', () => {
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveConfigPath()).toBe(join(homedir(), '.config', 'workhub', 'config.yaml'));
  });

  it('saveConfig creates the directory and writes the expected YAML', async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-save-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    await saveConfig({
      origins: '/tmp/repos',
      editor: 'zed',
    });

    const fileContents = await readFile(join(xdgDirectory, 'workhub', 'config.yaml'), 'utf8');

    expect(fileContents).toContain('origins: /tmp/repos');
    expect(fileContents).toContain('editor: zed');
  });

  it('configExists returns false when the config is missing and true once saved', async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-exists-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    await expect(configExists()).resolves.toBe(false);

    await saveConfig({
      origins: '/tmp/repos',
      editor: 'zed',
    });

    await expect(configExists()).resolves.toBe(true);
  });
});
