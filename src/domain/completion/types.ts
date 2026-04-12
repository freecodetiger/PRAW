import type { CompletionCandidate, CompletionContextSnapshot } from "../ai/types";

export interface LocalCompletionRequest {
  cwd: string;
  inputPrefix: string;
  shell: string;
  recentHistory: string[];
}

export interface LocalCompletionResponse {
  suggestions: CompletionCandidate[];
  context: CompletionContextSnapshot;
}
