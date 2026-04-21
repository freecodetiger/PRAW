import { describe, expect, it } from "vitest";

import { createEmptySessionCompletionContext } from "./session-memory";
import {
  applySourceResult,
  buildSuggestionSessionPresentation,
  createEmptySuggestionSession,
} from "./orchestrator";
import type { SessionCompletionContext, SuggestionItem, SuggestionSourceResult } from "./types";

function suggestion(overrides: Partial<SuggestionItem> = {}): SuggestionItem {
  return {
    id: overrides.id ?? "local:1",
    text: overrides.text ?? "git status",
    kind: overrides.kind ?? "completion",
    source: overrides.source ?? "local",
    score: overrides.score ?? 900,
    group: overrides.group ?? "inline",
    applyMode: overrides.applyMode ?? "append",
    replacement: overrides.replacement ?? {
      type: "append",
      suffix: " status",
    },
    reason: overrides.reason,
    sourceId: overrides.sourceId,
  };
}

function context(overrides: Partial<SessionCompletionContext> = {}): SessionCompletionContext {
  return {
    ...createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
    ...overrides,
  };
}

describe("orchestrator", () => {
  it("applies local source results immediately", () => {
    const session = applySourceResult(createEmptySuggestionSession(1), {
      sourceId: "local",
      generation: 1,
      state: "success",
      suggestions: [suggestion()],
    });

    expect(session.suggestions).toHaveLength(1);
    expect(session.sources.local.state).toBe("success");
    expect(session.activeGroup).toBe("inline");
  });

  it("ignores stale source generations", () => {
    const session = applySourceResult(createEmptySuggestionSession(2), {
      sourceId: "ai-inline",
      generation: 1,
      state: "success",
      suggestions: [suggestion({ source: "ai" })],
    });

    expect(session.suggestions).toEqual([]);
    expect(session.sources["ai-inline"].state).toBe("stale");
  });

  it("keeps intent source idle unless trigger is tab", () => {
    const automatic = buildSuggestionSessionPresentation({
      draft: "查看 3000 端口",
      inputMode: "intent",
      trigger: "automatic",
      generation: 1,
      sourceResults: [
        {
          sourceId: "ai-intent",
          generation: 1,
          state: "success",
          suggestions: [suggestion({ source: "ai", kind: "intent", group: "intent", text: "lsof -i :3000" })],
        },
      ],
      context: context(),
    });

    expect(automatic.suggestions).toEqual([]);
    expect(automatic.sources["ai-intent"].state).toBe("idle");
  });

  it("surfaces intent as the active group while tab-triggered AI suggestions are still loading", () => {
    const session = buildSuggestionSessionPresentation({
      draft: "查看 3000 端口",
      inputMode: "intent",
      trigger: "tab",
      generation: 1,
      sourceResults: [
        {
          sourceId: "ai-intent",
          generation: 1,
          state: "loading",
          suggestions: [],
        },
      ],
      context: context(),
    });

    expect(session.suggestions).toEqual([]);
    expect(session.activeGroup).toBe("intent");
    expect(session.sources["ai-intent"].state).toBe("loading");
  });

  it("surfaces recovery as the active group while AI recovery suggestions are still loading", () => {
    const session = buildSuggestionSessionPresentation({
      draft: "",
      inputMode: "recovery",
      trigger: "automatic",
      generation: 1,
      sourceResults: [
        {
          sourceId: "ai-recovery",
          generation: 1,
          state: "loading",
          suggestions: [],
        },
      ],
      context: context(),
    });

    expect(session.suggestions).toEqual([]);
    expect(session.activeGroup).toBe("recovery");
    expect(session.sources["ai-recovery"].state).toBe("loading");
  });

  it("favors AI intent candidates in tab-triggered intent mode", () => {
    const sourceResults: SuggestionSourceResult[] = [
      {
        sourceId: "local",
        generation: 1,
        state: "success",
        suggestions: [suggestion({ text: "git status", source: "local", score: 980 })],
      },
      {
        sourceId: "ai-intent",
        generation: 1,
        state: "success",
        suggestions: [suggestion({ text: "lsof -i :3000", source: "ai", kind: "intent", group: "intent", score: 800 })],
      },
    ];

    const session = buildSuggestionSessionPresentation({
      draft: "查看 3000 端口",
      inputMode: "intent",
      trigger: "tab",
      generation: 1,
      sourceResults,
      context: context(),
    });

    expect(session.activeGroup).toBe("intent");
    expect(session.suggestions[0]).toMatchObject({
      source: "ai",
      kind: "intent",
      text: "lsof -i :3000",
    });
  });

  it("uses accepted suggestion feedback as a current-session ranking hint", () => {
    const session = buildSuggestionSessionPresentation({
      draft: "pn",
      inputMode: "prefix",
      trigger: "automatic",
      generation: 1,
      sourceResults: [
        {
          sourceId: "local",
          generation: 1,
          state: "success",
          suggestions: [
            suggestion({ text: "pnpm run dev", score: 800, replacement: { type: "append", suffix: "pm run dev" } }),
            suggestion({ text: "pnpm test", score: 800, replacement: { type: "append", suffix: "pm test" } }),
          ],
        },
      ],
      context: context({
        acceptedSuggestions: [
          {
            source: "local",
            kind: "completion",
            text: "pnpm test",
            draft: "pn",
            cwd: "/workspace",
            acceptedAt: 1,
          },
        ],
      }),
    });

    expect(session.suggestions[0]?.text).toBe("pnpm test");
  });
});
