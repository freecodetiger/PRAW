export type CompletionProvider = "glm";

export interface CompletionRequest {
  provider: CompletionProvider;
  model: string;
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
