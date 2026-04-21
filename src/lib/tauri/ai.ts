import { invoke } from "@tauri-apps/api/core";

import type {
  AiInlineSuggestionRequest,
  AiIntentSuggestionRequest,
  AiRecoverySuggestionRequest,
  AiSuggestionCommandResult,
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
): Promise<AiSuggestionCommandResult | null> {
  try {
    return normalizeSuggestionCommandResult(
      await invoke<AiSuggestionCommandResult | SuggestionResponse | null>("request_ai_inline_suggestions", { request }),
    );
  } catch {
    return {
      status: "networkError",
      suggestions: [],
    };
  }
}

export async function requestAiRecoverySuggestions(
  request: AiRecoverySuggestionRequest,
): Promise<AiSuggestionCommandResult | null> {
  try {
    return normalizeSuggestionCommandResult(
      await invoke<AiSuggestionCommandResult | SuggestionResponse | null>("request_ai_recovery_suggestions", { request }),
    );
  } catch {
    return {
      status: "networkError",
      suggestions: [],
    };
  }
}

export async function requestAiIntentSuggestions(
  request: AiIntentSuggestionRequest,
): Promise<AiSuggestionCommandResult | null> {
  try {
    return normalizeSuggestionCommandResult(
      await invoke<AiSuggestionCommandResult | SuggestionResponse | null>("request_ai_intent_suggestions", { request }),
    );
  } catch {
    return {
      status: "networkError",
      suggestions: [],
    };
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

function normalizeSuggestionCommandResult(
  response: AiSuggestionCommandResult | SuggestionResponse | null,
): AiSuggestionCommandResult | null {
  if (!response) {
    return null;
  }

  if ("status" in response) {
    return response;
  }

  return {
    status: response.suggestions.length > 0 ? "success" : "empty",
    suggestions: response.suggestions,
    latencyMs: response.latencyMs,
  };
}
