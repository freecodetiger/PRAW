export type CompletionProvider = "glm";

export type CompletionCandidateSource = "local" | "ai" | "system";

export type CompletionCandidateKind =
  | "command"
  | "history"
  | "path"
  | "git"
  | "docker"
  | "ssh"
  | "systemctl"
  | "go"
  | "package"
  | "kubectl"
  | "network";

export interface CwdSummary {
  dirs: string[];
  files: string[];
}

export interface SystemSummary {
  os: "ubuntu";
  shell: string;
  packageManager: string;
}

export interface CompletionContextSnapshot {
  pwd: string;
  gitBranch: string | null;
  gitStatusSummary: string[];
  recentHistory: string[];
  cwdSummary: CwdSummary;
  systemSummary: SystemSummary;
  toolAvailability: string[];
}

export interface CompletionCandidate {
  text: string;
  source: CompletionCandidateSource;
  score: number;
  kind: CompletionCandidateKind;
}

export interface CompletionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  prefix: string;
  pwd: string;
  gitBranch: string | null;
  gitStatusSummary: string[];
  recentHistory: string[];
  cwdSummary: CwdSummary;
  systemSummary: SystemSummary;
  toolAvailability: string[];
  sessionId: string;
  userId: string;
}

export interface CompletionResponse {
  suggestions: CompletionCandidate[];
  latencyMs: number;
}

export type AiConnectionStatus =
  | "success"
  | "auth_error"
  | "network_error"
  | "timeout"
  | "config_error"
  | "provider_error";

export interface AiConnectionTestRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
}

export interface AiConnectionTestResult {
  status: AiConnectionStatus;
  message: string;
  latencyMs?: number;
}
