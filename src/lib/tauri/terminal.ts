import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  CodexSessionSummary,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  TerminalAgentEvent,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSemanticEvent,
} from "../../domain/terminal/types";
import {
  TERMINAL_AGENT_EVENT,
  TERMINAL_EXIT_EVENT,
  TERMINAL_OUTPUT_EVENT,
  TERMINAL_SEMANTIC_EVENT,
} from "../../domain/terminal/types";

export async function createTerminalSession(
  request: CreateTerminalSessionRequest,
): Promise<CreateTerminalSessionResponse> {
  return invoke<CreateTerminalSessionResponse>("create_terminal_session", { request });
}

export async function writeTerminalSession(sessionId: string, data: string): Promise<void> {
  await invoke("write_terminal_session", { sessionId, data });
}

export async function resizeTerminalSession(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("resize_terminal_session", { sessionId, cols, rows });
}

export async function closeTerminalSession(sessionId: string): Promise<void> {
  await invoke("close_terminal_session", { sessionId });
}

export async function submitTerminalAgentPrompt(sessionId: string, prompt: string): Promise<void> {
  await invoke("submit_terminal_agent_prompt", { sessionId, prompt });
}

export async function resetTerminalAgentSession(sessionId: string): Promise<void> {
  await invoke("reset_terminal_agent_session", { sessionId });
}

export async function attachTerminalAgentSession(
  sessionId: string,
  remoteSessionId: string,
): Promise<void> {
  await invoke("attach_terminal_agent_session", { sessionId, remoteSessionId });
}

export async function setTerminalAgentModel(sessionId: string, model: string | null): Promise<void> {
  await invoke("set_terminal_agent_model", { sessionId, model });
}

export async function listCodexSessions(): Promise<CodexSessionSummary[]> {
  return invoke<CodexSessionSummary[]>("list_codex_sessions");
}

export async function runTerminalAgentReview(
  cwd: string,
  prompt?: string,
): Promise<string> {
  return invoke<string>("run_terminal_agent_review", { cwd, prompt });
}

export function onTerminalOutput(
  handler: (event: TerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>(TERMINAL_OUTPUT_EVENT, (event) => handler(event.payload));
}

export function onTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>(TERMINAL_EXIT_EVENT, (event) => handler(event.payload));
}

export function onTerminalSemantic(
  handler: (event: TerminalSemanticEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalSemanticEvent>(TERMINAL_SEMANTIC_EVENT, (event) => handler(event.payload));
}

export function onTerminalAgent(handler: (event: TerminalAgentEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalAgentEvent>(TERMINAL_AGENT_EVENT, (event) => handler(event.payload));
}
