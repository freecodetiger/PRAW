import { invoke } from "@tauri-apps/api/core";

import type { LocalCompletionRequest, LocalCompletionResponse } from "../../domain/completion/types";

export async function requestLocalCompletion(
  request: LocalCompletionRequest,
): Promise<LocalCompletionResponse | null> {
  try {
    return await invoke<LocalCompletionResponse | null>("request_local_completion", { request });
  } catch {
    return null;
  }
}
