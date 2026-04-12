import type { AiConnectionTestResult } from "../../../domain/ai/types";

interface ProviderErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

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

  return formatProviderError(result.message);
}

function formatProviderError(message: string): string {
  const payload = parseProviderErrorPayload(message);
  if (!payload?.error?.code) {
    return `Provider error: ${message}`;
  }

  if (payload.error.code === "1302") {
    return `GLM rate limit reached (1302): ${payload.error.message ?? message}`;
  }

  return `Provider error: ${payload.error.message ?? message}`;
}

function parseProviderErrorPayload(message: string): ProviderErrorPayload | null {
  try {
    return JSON.parse(message) as ProviderErrorPayload;
  } catch {
    return null;
  }
}
