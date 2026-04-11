import type { AiConnectionTestResult } from "../../../domain/ai/types";

export function describeAiConnectionResult(result: AiConnectionTestResult): string {
  if (result.status === "success") {
    return result.latencyMs === undefined ? "Connection OK" : `Connection OK · ${result.latencyMs} ms`;
  }

  if (result.status === "auth_error") {
    return `Authentication failed: ${result.message}`;
  }

  if (result.status === "network_error") {
    return `Network error: ${result.message}`;
  }

  if (result.status === "timeout") {
    return `Request timed out: ${result.message}`;
  }

  if (result.status === "config_error") {
    return `Configuration error: ${result.message}`;
  }

  return `Provider error: ${result.message}`;
}
