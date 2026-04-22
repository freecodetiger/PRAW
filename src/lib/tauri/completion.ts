import { invoke } from "@tauri-apps/api/core";

import type {
  CompletionCommandExecutionRequest,
  CompletionSuggestionAcceptanceRequest,
  LocalCompletionRequest,
  LocalCompletionResponse,
} from "../../domain/completion/types";

export async function requestLocalCompletion(
  request: LocalCompletionRequest,
): Promise<LocalCompletionResponse | null> {
  try {
    return await invoke<LocalCompletionResponse | null>("request_local_completion", { request });
  } catch {
    return null;
  }
}

export async function recordCompletionCommandExecution(
  request: CompletionCommandExecutionRequest,
): Promise<void> {
  try {
    await invoke("record_completion_command_execution", { request });
  } catch {
    // Ignore telemetry failures so completion UX stays available.
  }
}

export async function recordCompletionSuggestionAcceptance(
  request: CompletionSuggestionAcceptanceRequest,
): Promise<void> {
  try {
    await invoke("record_completion_suggestion_acceptance", { request });
  } catch {
    // Ignore telemetry failures so completion UX stays available.
  }
}
