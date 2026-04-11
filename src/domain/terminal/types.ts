export const TERMINAL_OUTPUT_EVENT = "terminal/output";
export const TERMINAL_EXIT_EVENT = "terminal/exit";

export type TerminalSessionStatus = "starting" | "running" | "exited" | "error";

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
