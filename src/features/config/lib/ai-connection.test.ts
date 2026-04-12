import { describe, expect, it } from "vitest";

import type { AiConnectionTestResult } from "../../../domain/ai/types";
import { describeAiConnectionResult } from "./ai-connection";

function result(overrides: Partial<AiConnectionTestResult>): AiConnectionTestResult {
  return {
    status: "success",
    message: "ok",
    latencyMs: 42,
    ...overrides,
  };
}

describe("describeAiConnectionResult", () => {
  it("formats a success result with latency", () => {
    expect(describeAiConnectionResult(result({}))).toBe("Connection OK · 42 ms");
  });

  it("formats an auth failure as a user-facing error", () => {
    expect(
      describeAiConnectionResult(result({ status: "auth_error", message: "invalid API key" })),
    ).toBe("Authentication failed: invalid API key");
  });

  it("explains provider rate limiting clearly for GLM error code 1302", () => {
    expect(
      describeAiConnectionResult(
        result({
          status: "provider_error",
          message:
            '{"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}',
        }),
      ),
    ).toBe("GLM rate limit reached (1302): 您的账户已达到速率限制，请您控制请求频率");
  });

  it("formats timeout and provider failures distinctly", () => {
    expect(describeAiConnectionResult(result({ status: "timeout", message: "request timed out" }))).toBe(
      "Request timed out: request timed out",
    );
    expect(describeAiConnectionResult(result({ status: "provider_error", message: "model not found" }))).toBe(
      "Provider error: model not found",
    );
  });
});
