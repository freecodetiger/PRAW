import type {
  CompletionCandidateSource,
  CompletionContextSnapshot,
  CompletionProvider,
} from "../ai/types";

export type SuggestionKind = "completion" | "correction" | "intent" | "recovery";
export type SuggestionGroup = "inline" | "intent" | "recovery";
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
  reason?: string;
  sourceId?: string;
}

export interface SuggestionResponse {
  suggestions: SuggestionItem[];
  latencyMs: number;
}

export type AiSuggestionCommandStatus =
  | "success"
  | "empty"
  | "timeout"
  | "authError"
  | "networkError"
  | "providerError"
  | "parseError";

export interface AiSuggestionCommandResult {
  status: AiSuggestionCommandStatus;
  suggestions: SuggestionItem[];
  latencyMs?: number;
  message?: string;
}

export type AiSuggestionStatus =
  | {
      state: "idle";
    }
  | {
      state: "loading";
    }
  | {
      state: "success";
      latencyMs?: number;
      count: number;
    }
  | {
      state: "empty";
      latencyMs?: number;
    }
  | {
      state: "timeout";
      message?: string;
    }
  | {
      state: "error";
      reason: AiSuggestionCommandStatus;
      message?: string;
    };

export interface AiInlineSuggestionRequest extends CompletionContextSnapshot {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  draft: string;
  sessionId: string;
  userId: string;
}

export interface AiRecoverySuggestionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  command: string;
  output: string;
  exitCode: number;
  cwd: string;
  shell: string;
  recentHistory: string[];
  sessionId: string;
  userId: string;
}

export interface AiIntentSuggestionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  draft: string;
  contextPack: AiCompletionContextPack;
  sessionId: string;
  userId: string;
}

export interface CommandMemory {
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  completedAt?: number;
  outputSummary?: string;
  outputTail?: string;
}

export interface FailureMemory {
  command: string;
  cwd: string;
  exitCode: number;
  outputSummary: string;
  occurredAt: number;
}

export interface CwdCommandStat {
  command: string;
  count: number;
  lastUsedAt: number;
  successCount: number;
  failureCount: number;
}

export interface CwdCommandStats {
  cwd: string;
  frequentCommands: CwdCommandStat[];
}

export interface ProjectProfile {
  type: "node" | "rust" | "python" | "go" | "unknown";
  packageManager: string;
  scripts: string[];
  gitBranch?: string;
  gitStatusSummary: string[];
  toolAvailability: string[];
}

export interface SuggestionFeedback {
  source: CompletionCandidateSource;
  kind: SuggestionKind;
  text: string;
  draft: string;
  cwd: string;
  acceptedAt?: number;
  rejectedAt?: number;
}

export interface SessionCompletionContext {
  tabId: string;
  cwd: string;
  shell: string;
  recentCommands: CommandMemory[];
  recentFailures: FailureMemory[];
  cwdCommandStats: Record<string, CwdCommandStats>;
  acceptedSuggestions: SuggestionFeedback[];
  rejectedAiSuggestions: SuggestionFeedback[];
  projectProfile: ProjectProfile | null;
}

export type CompletionInputMode = "prefix" | "intent";

export interface AiCompletionContextPack {
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  cwd: string;
  shell: string;
  recentCommands: string[];
  recentSuccesses: string[];
  recentFailures: Array<{
    command: string;
    exitCode: number;
    outputSummary: string;
  }>;
  frequentCommandsInCwd: string[];
  projectProfile: {
    type: ProjectProfile["type"];
    scripts: string[];
    packageManager: string;
  };
  localCandidates: string[];
  userPreferenceHints: string[];
}

export type SuggestionSourceId = "local" | "workflow" | "ai-inline" | "ai-intent" | "ai-recovery";
export type SuggestionSourceStateName = "idle" | "loading" | "success" | "empty" | "error" | "stale";
export type SuggestionTrigger = "automatic" | "tab";

export interface SourceState {
  sourceId: SuggestionSourceId;
  state: SuggestionSourceStateName;
  message?: string;
}

export interface SuggestionSourceResult {
  sourceId: SuggestionSourceId;
  generation: number;
  state: SuggestionSourceStateName;
  suggestions: SuggestionItem[];
  message?: string;
}

export interface SuggestionSession {
  suggestions: SuggestionItem[];
  sources: Record<SuggestionSourceId, SourceState>;
  activeGroup: "inline" | "intent" | "recovery" | null;
  ghostSuggestion: SuggestionItem | null;
  generation: number;
}
