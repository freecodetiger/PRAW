import type {
  CompletionCandidateSource,
  CompletionContextSnapshot,
  CompletionProvider,
} from "../ai/types";

export type SuggestionKind = "completion" | "correction" | "intent" | "recovery";
export type SuggestionGroup = "inline" | "recovery";
export type SuggestionApplyMode = "append" | "replace";

export type SuggestionReplacement =
  | {
      type: "append";
      suffix: string;
    }
  | {
      type: "replace-all";
      value: string;
    };

export interface SuggestionItem {
  id: string;
  text: string;
  kind: SuggestionKind;
  source: CompletionCandidateSource;
  score: number;
  group: SuggestionGroup;
  applyMode: SuggestionApplyMode;
  replacement: SuggestionReplacement;
}

export interface SuggestionResponse {
  suggestions: SuggestionItem[];
  latencyMs: number;
}

export interface AiInlineSuggestionRequest extends CompletionContextSnapshot {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  draft: string;
  sessionId: string;
  userId: string;
}

export interface AiRecoverySuggestionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  command: string;
  output: string;
  exitCode: number;
  cwd: string;
  shell: string;
  recentHistory: string[];
  sessionId: string;
  userId: string;
}
