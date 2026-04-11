export interface LocalCompletionRequest {
  cwd: string;
  inputPrefix: string;
}

export interface LocalCompletionResponse {
  suggestion: string;
}
