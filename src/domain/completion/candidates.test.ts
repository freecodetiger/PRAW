import { describe, expect, it } from "vitest";

import type { CompletionCandidate } from "../ai/types";
import { buildCandidateSuffix, buildGhostSuffix, mergeCompletionCandidates } from "./candidates";

function candidate(
  text: string,
  source: CompletionCandidate["source"],
  score: number,
): CompletionCandidate {
  return {
    text,
    source,
    score,
    kind: "command",
  };
}

describe("completion candidates", () => {
  it("orders candidates by source priority before score", () => {
    const merged = mergeCompletionCandidates({
      local: [candidate("git checkout main", "local", 0.4)],
      ai: [candidate('git commit -m "update"', "ai", 0.95)],
      system: [candidate("git config", "system", 0.9)],
    });

    expect(merged.map((entry) => entry.text)).toEqual([
      "git checkout main",
      'git commit -m "update"',
      "git config",
    ]);
  });

  it("deduplicates by text and keeps the higher-priority source", () => {
    const merged = mergeCompletionCandidates({
      local: [candidate("git checkout dev", "local", 0.5)],
      ai: [candidate("git checkout dev", "ai", 0.99)],
      system: [],
    });

    expect(merged).toEqual([candidate("git checkout dev", "local", 0.5)]);
  });

  it("caps the merged list at five candidates", () => {
    const merged = mergeCompletionCandidates({
      local: [candidate("a", "local", 10), candidate("b", "local", 9), candidate("c", "local", 8)],
      ai: [candidate("d", "ai", 7), candidate("e", "ai", 6), candidate("f", "ai", 5)],
      system: [],
    });

    expect(merged).toHaveLength(5);
    expect(merged.map((entry) => entry.text)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("builds a suffix for the selected candidate only when it extends the draft", () => {
    expect(buildCandidateSuffix("git c", candidate("git checkout main", "local", 0.7))).toBe("heckout main");
    expect(buildCandidateSuffix("git checkout", candidate("docker logs api", "ai", 0.9))).toBe("");
    expect(buildCandidateSuffix("git checkout", null)).toBe("");
  });

  it("builds a ghost suffix from the first merged candidate", () => {
    expect(buildGhostSuffix("git c", [candidate("git checkout main", "local", 0.7)])).toBe("heckout main");
    expect(buildGhostSuffix("git checkout", [candidate("docker logs api", "ai", 0.9)])).toBe("");
  });
});
