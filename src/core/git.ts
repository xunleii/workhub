import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { OriginRepo } from '../types.js';

export async function scanOrigins(originsPath: string): Promise<OriginRepo[]> {
  try {
    await access(originsPath);
  } catch {
    throw new Error(`Origins directory not found: ${originsPath}`);
  }

  const entries = await readdir(originsPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  const repositories = await Promise.all(
    directories.map(async (directory) => {
      const repositoryPath = join(originsPath, directory.name);
      const gitPath = join(repositoryPath, '.git');

      try {
        await access(gitPath);
        return { name: directory.name, path: repositoryPath };
      } catch {
        return null;
      }
    }),
  );

  return repositories
    .filter((repository): repository is OriginRepo => repository !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
