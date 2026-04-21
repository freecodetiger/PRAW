import { describe, expect, it, vi } from "vitest";

import { createEmptySessionCompletionContext } from "../../../domain/suggestion/session-memory";
import { runAiIntentSource } from "./suggestion-sources";

describe("suggestion-sources", () => {
  it("does not call AI intent source for automatic prefix triggers", async () => {
    const requestAiIntentSuggestions = vi.fn();

    const result = await runAiIntentSource({
      draft: "git st",
      inputMode: "prefix",
      trigger: "automatic",
      generation: 1,
      context: createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
      localCandidates: [],
      aiConfig: {
        enabled: true,
        provider: "glm",
        model: "glm-4.7-flash",
        apiKey: "secret-key",
        baseUrl: "",
      },
      sessionId: "session-1",
      userId: "user-1",
      requestAiIntentSuggestions,
    });

    expect(requestAiIntentSuggestions).not.toHaveBeenCalled();
    expect(result.state).toBe("idle");
    expect(result.suggestions).toEqual([]);
  });

  it("builds a context-pack intent request for tab-triggered natural language", async () => {
    const requestAiIntentSuggestions = vi.fn(async () => ({
      status: "success" as const,
      suggestions: [
        {
          id: "ai:intent:1",
          text: "lsof -i :3000",
          kind: "intent" as const,
          source: "ai" as const,
          score: 900,
          group: "intent" as const,
          applyMode: "replace" as const,
          replacement: {
            type: "replace-all" as const,
            value: "lsof -i :3000",
          },
          reason: "find process using port",
        },
      ],
      latencyMs: 1200,
    }));

    const result = await runAiIntentSource({
      draft: "查看 3000 端口被谁占用",
      inputMode: "intent",
      trigger: "tab",
      generation: 7,
      context: createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
      localCandidates: ["lsof"],
      aiConfig: {
        enabled: true,
        provider: "glm",
        model: "glm-4.7-flash",
        apiKey: "secret-key",
        baseUrl: "",
      },
      sessionId: "session-1",
      userId: "user-1",
      requestAiIntentSuggestions,
    });

    expect(requestAiIntentSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: "查看 3000 端口被谁占用",
        contextPack: expect.objectContaining({
          inputMode: "intent",
          cwd: "/workspace",
          localCandidates: ["lsof"],
        }),
      }),
    );
    expect(result).toMatchObject({
      sourceId: "ai-intent",
      generation: 7,
      state: "success",
      suggestions: [
        {
          source: "ai",
          kind: "intent",
          group: "intent",
          text: "lsof -i :3000",
        },
      ],
    });
  });
});
