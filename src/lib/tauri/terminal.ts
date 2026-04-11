import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  TerminalExitEvent,
  TerminalOutputEvent,
} from "../../domain/terminal/types";
import { TERMINAL_EXIT_EVENT, TERMINAL_OUTPUT_EVENT } from "../../domain/terminal/types";

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

export function onTerminalOutput(
  handler: (event: TerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>(TERMINAL_OUTPUT_EVENT, (event) => handler(event.payload));
}

export function onTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>(TERMINAL_EXIT_EVENT, (event) => handler(event.payload));
}
