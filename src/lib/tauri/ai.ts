import { invoke } from "@tauri-apps/api/core";

import type {
  AiInlineSuggestionRequest,
  AiRecoverySuggestionRequest,
  SuggestionResponse,
} from "../../domain/suggestion/types";
import type {
  AiConnectionTestRequest,
  AiConnectionTestResult,
  CompletionRequest,
  CompletionResponse,
} from "../../domain/ai/types";

export async function requestGhostCompletion(request: CompletionRequest): Promise<CompletionResponse | null> {
  try {
    return await invoke<CompletionResponse | null>("request_completion", { request });
  } catch {
    return null;
  }
}

export async function requestAiInlineSuggestions(
  request: AiInlineSuggestionRequest,
): Promise<SuggestionResponse | null> {
  try {
    return await invoke<SuggestionResponse | null>("request_ai_inline_suggestions", { request });
  } catch {
    return null;
  }
}

export async function requestAiRecoverySuggestions(
  request: AiRecoverySuggestionRequest,
): Promise<SuggestionResponse | null> {
  try {
    return await invoke<SuggestionResponse | null>("request_ai_recovery_suggestions", { request });
  } catch {
    return null;
  }
}

export async function testAiConnection(request: AiConnectionTestRequest): Promise<AiConnectionTestResult> {
  try {
    return await invoke<AiConnectionTestResult>("test_ai_connection", { request });
  } catch (error) {
    return {
      status: "provider_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
