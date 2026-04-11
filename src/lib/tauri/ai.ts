import { invoke } from "@tauri-apps/api/core";

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
