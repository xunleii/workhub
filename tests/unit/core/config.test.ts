import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { configExists, loadConfig, resolveConfigPath, saveConfig } from '../../../src/core/config.js';

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

  it('loadConfig returns the config from a valid YAML file', async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-load-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    await saveConfig({
      origins: '/tmp/repos',
      editor: 'code',
    });

    await expect(loadConfig()).resolves.toEqual({
      origins: '/tmp/repos',
      editor: 'code',
    });
  });

  it("loadConfig defaults editor to 'zed' when it is absent", async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-default-editor-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    const configPath = join(xdgDirectory, 'workhub', 'config.yaml');
    await rm(join(xdgDirectory, 'workhub'), { recursive: true, force: true });
    await saveConfig({
      origins: '/tmp/repos',
      editor: 'code',
    });
    await rm(configPath, { force: true });
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(join(xdgDirectory, 'workhub', 'config.yaml'), 'origins: /tmp/repos\n', 'utf8'),
    );

    await expect(loadConfig()).resolves.toEqual({
      origins: '/tmp/repos',
      editor: 'zed',
    });
  });

  it('loadConfig throws when the config file does not exist', async () => {
    const xdgDirectory = await mkdtemp(join(tmpdir(), 'workhub-missing-config-'));
    createdDirectories.push(xdgDirectory);
    process.env.XDG_CONFIG_HOME = xdgDirectory;

    await expect(loadConfig()).rejects.toThrow(
      `Config file not found at ${join(xdgDirectory, 'workhub', 'config.yaml')}. Run 'wh new' to set up.`,
    );
  });
});
