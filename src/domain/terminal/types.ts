export const TERMINAL_OUTPUT_EVENT = "terminal/output";
export const TERMINAL_EXIT_EVENT = "terminal/exit";
export const TERMINAL_SEMANTIC_EVENT = "terminal/semantic";

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
