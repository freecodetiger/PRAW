export type CompletionProvider = "glm";

export interface CompletionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  shell: string;
  os: "ubuntu";
  cwd: string;
  inputPrefix: string;
  recentCommands: string[];
}

export interface CompletionResponse {
  suggestion: string;
  replaceRange?: [number, number];
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
