/**
 * Persisted application-level configuration loaded from the user's config file.
 */
export interface AppConfig {
  origins: string;
  editor: string;
}

/**
 * Persisted description of a workspace and the worktrees associated with it.
 */
export interface WorkspaceConfig {
  name: string;
  branch: string;
  created_at: string;
  paths: Array<{ repo: string; path: string }>;
}

/**
 * Result of destructive-operation safety checks for a single path.
 */
export interface SafetyCheckResult {
  path: string;
  dirty: boolean;
  unpushed: boolean;
}

/**
 * Repository discovered under the configured origins directory.
 */
export interface OriginRepo {
  name: string;
  path: string;
}

/**
 * Lightweight workspace information for interactive lists.
 */
export interface WorkspaceSummary {
  name: string;
  staleCount: number;
}

/**
 * Git and filesystem status for a workspace path shown by `wh open --status`.
 */
export interface WorkspacePathStatus {
  repo: string;
  path: string;
  exists: boolean;
  branch?: string;
  dirty: boolean;
  unpushed: boolean;
}

/**
 * Process exit codes used by the CLI.
 */
export enum ExitCode {
  Success = 0,
  UserAbort = 1,
  ToolError = 2,
  GitSafetyBlock = 3,
}
