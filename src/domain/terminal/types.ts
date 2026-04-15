export const TERMINAL_OUTPUT_EVENT = "terminal/output";
export const TERMINAL_EXIT_EVENT = "terminal/exit";
export const TERMINAL_SEMANTIC_EVENT = "terminal/semantic";
export const TERMINAL_AGENT_EVENT = "terminal/agent";

export type TerminalSessionStatus = "starting" | "running" | "exited" | "error";
export type TerminalSemanticKind = "interactive" | "classic-required" | "agent-workflow";
export type TerminalSemanticReason =
  | "alternate-screen"
  | "mouse-mode"
  | "full-screen-cursor-control"
  | "shell-entry"
  | "manual-escalation";
export type TerminalSemanticConfidence = "strong";

export interface CreateTerminalSessionRequest {
  sessionId: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CreateTerminalSessionResponse {
  sessionId: string;
  shell: string;
  cwd: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
}

export interface TerminalSemanticEvent {
  sessionId: string;
  kind: TerminalSemanticKind;
  reason: TerminalSemanticReason;
  confidence: TerminalSemanticConfidence;
  commandEntry?: string;
}

export type TerminalAgentMode = "structured" | "raw-fallback";
export type TerminalAgentState = "connecting" | "ready" | "running" | "fallback";

export interface CodexSessionSummary {
  id: string;
  timestamp: string;
  cwd: string;
  latestPrompt?: string | null;
  source?: string | null;
  modelProvider?: string | null;
  cliVersion?: string | null;
}

export type TerminalAgentEvent =
  | {
      type: "bridge-state";
      sessionId: string;
      provider: string;
      mode: TerminalAgentMode;
      state: TerminalAgentState;
      fallbackReason?: string | null;
    }
  | {
      type: "assistant-message";
      sessionId: string;
      provider: string;
      text: string;
    }
  | {
      type: "error";
      sessionId: string;
      provider: string;
      message: string;
    }
  | {
      type: "turn-complete";
      sessionId: string;
      provider: string;
    };
