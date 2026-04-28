export interface AppConfig {
  origins: string;
  editor: string;
}

export interface WorkspaceConfig {
  name: string;
  branch: string;
  created_at: string;
  paths: Array<{ repo: string; path: string }>;
}

export interface SafetyCheckResult {
  path: string;
  dirty: boolean;
  unpushed: boolean;
}

export interface OriginRepo {
  name: string;
  path: string;
}

export interface WorkspaceSummary {
  name: string;
  staleCount: number;
}

export enum ExitCode {
  Success = 0,
  UserAbort = 1,
  ToolError = 2,
  GitSafetyBlock = 3,
}
