import { describe, expect, it } from "vitest";

import { buildAiCompletionContextPack } from "./context-pack";
import { createEmptySessionCompletionContext, recordCompletedCommand } from "./session-memory";

describe("context-pack", () => {
  it("builds a bounded prefix context pack with recent commands and local candidates", () => {
    const context = recordCompletedCommand(
      {
        ...createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
        projectProfile: {
          type: "node",
          packageManager: "pnpm",
          scripts: ["dev", "test", "build"],
          gitStatusSummary: [" M src/main.ts"],
          toolAvailability: ["git", "pnpm"],
        },
      },
      {
        command: "pnpm test",
        cwd: "/workspace",
        exitCode: 0,
        output: "passed",
        completedAt: 1,
      },
    );

    const pack = buildAiCompletionContextPack({
      draft: "pn",
      inputMode: "prefix",
      context,
      localCandidates: ["pnpm test", "pnpm run dev"],
    });

    expect(pack.inputMode).toBe("prefix");
    expect(pack.projectProfile.type).toBe("node");
    expect(pack.projectProfile.scripts).toEqual(["dev", "test", "build"]);
    expect(pack.recentSuccesses).toContain("pnpm test");
    expect(pack.localCandidates).toEqual(["pnpm test", "pnpm run dev"]);
  });
});
