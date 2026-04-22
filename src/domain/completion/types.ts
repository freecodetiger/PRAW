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

export interface CompletionCommandExecutionRequest {
  commandText: string;
  cwd: string;
  shell: string;
  exitCode?: number | null;
  executedAt: number;
}

export interface CompletionSuggestionAcceptanceRequest {
  draft: string;
  acceptedText: string;
  cwd: string;
  acceptedAt: number;
}
