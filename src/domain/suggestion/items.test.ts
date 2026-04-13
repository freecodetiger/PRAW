import { describe, expect, it } from "vitest";

import type { SuggestionItem } from "./types";
import { applySuggestion, mergeSuggestionItems, selectGhostSuggestion } from "./items";

function suggestion(overrides: Partial<SuggestionItem>): SuggestionItem {
  return {
    id: overrides.id ?? "suggestion:1",
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
  };
}

describe("suggestion items", () => {
  it("applies append suggestions to the current draft", () => {
    expect(
      applySuggestion(
        "git",
        suggestion({
          text: "git status",
          replacement: {
            type: "append",
            suffix: " status",
          },
        }),
      ),
    ).toBe("git status");
  });

  it("replaces the full draft for correction and recovery suggestions", () => {
    expect(
      applySuggestion(
        "gti sttaus",
        suggestion({
          kind: "correction",
          applyMode: "replace",
          text: "git status",
          replacement: {
            type: "replace-all",
            value: "git status",
          },
        }),
      ),
    ).toBe("git status");
  });

  it("selects only append-style completion suggestions for the ghost layer", () => {
    const ghost = selectGhostSuggestion("git", [
      suggestion({
        id: "correction",
        kind: "correction",
        applyMode: "replace",
        text: "git",
        replacement: {
          type: "replace-all",
          value: "git",
        },
      }),
      suggestion({
        id: "completion",
        text: "git status",
        replacement: {
          type: "append",
          suffix: " status",
        },
      }),
    ]);

    expect(ghost?.text).toBe("git status");
  });

  it("deduplicates identical suggestions while keeping the strongest match", () => {
    const merged = mergeSuggestionItems([
      suggestion({
        id: "ai",
        text: "git checkout main",
        source: "ai",
        score: 810,
      }),
      suggestion({
        id: "local",
        text: "git checkout main",
        source: "local",
        score: 920,
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "local",
      source: "local",
      score: 920,
    });
  });
});
