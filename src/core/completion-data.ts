import { getActiveConfig } from './config.js';
import { listLocalBranches, listWorktreeBranches, scanOrigins } from './git.js';
import { listWorkspaces, loadWorkspace } from './workspace.js';

/**
 * Completion datasets exposed to shell integration.
 */
export type CompletionDataSet = 'repos' | 'workspace-repos' | 'workspaces' | 'branches';

/**
 * Converts discovered repositories into user-friendly completion values.
 *
 * Unique basenames are exposed as-is, while ambiguous names keep their full
 * relative repository path so the generated completion remains unambiguous.
 *
 * @param repositoryNames - Repository identifiers relative to origins.
 * @returns Sorted completion-ready repository values.
 */
export function buildRepositoryCompletionValues(repositoryNames: string[]): string[] {
  const basenameCounts = new Map<string, number>();

  for (const repositoryName of repositoryNames) {
    const basename = repositoryName.split('/').at(-1) ?? repositoryName;
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  }

  return repositoryNames
    .map((repositoryName) => {
      const basename = repositoryName.split('/').at(-1) ?? repositoryName;
      return basenameCounts.get(basename) === 1 ? basename : repositoryName;
    })
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Resolves the values returned by the hidden completion command.
 *
 * @param dataset - Requested completion dataset.
 * @param workspaceName - Workspace identifier when `dataset` is `workspace-repos`.
 * @returns Sorted completion values for the requested dataset.
 */
export async function listCompletionValues(
  dataset: CompletionDataSet,
  workspaceName?: string,
): Promise<string[]> {
  switch (dataset) {
    case 'repos': {
      const repositories = await scanOrigins(getActiveConfig().origins);
      return buildRepositoryCompletionValues(repositories.map((repository) => repository.name));
    }
    case 'workspace-repos': {
      if (!workspaceName) {
        return [];
      }

      const workspace = await loadWorkspace(workspaceName);
      return workspace.paths.map((workspacePath) => workspacePath.repo).sort((left, right) => left.localeCompare(right));
    }
    case 'workspaces':
      return listWorkspaces();
    case 'branches': {
      const repositories = await scanOrigins(getActiveConfig().origins);
      const [localBranchArrays, worktreeBranchArrays] = await Promise.all([
        Promise.all(repositories.map((repository) => listLocalBranches(repository.path))),
        Promise.all(repositories.map((repository) => listWorktreeBranches(repository.path))),
      ]);
      const occupiedBranches = new Set(worktreeBranchArrays.flat());

      return [...new Set(localBranchArrays.flat())]
        .filter((branch) => !occupiedBranches.has(branch))
        .sort();
    }
    default:
      throw new Error(`Unsupported completion dataset: ${dataset satisfies never}`);
  }
}
