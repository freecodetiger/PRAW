import { describe, expect, it } from "vitest";

import {
  createEmptySessionCompletionContext,
  recordAcceptedSuggestion,
  recordCompletedCommand,
  recordRejectedAiSuggestions,
} from "./session-memory";

describe("session-memory", () => {
  it("records completed commands and keeps the newest bounded entries", () => {
    let context = createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash");

    for (let index = 0; index < 55; index += 1) {
      context = recordCompletedCommand(context, {
        command: `echo ${index}`,
        cwd: "/workspace",
        exitCode: 0,
        output: `line ${index}`,
        completedAt: index,
      });
    }

    expect(context.recentCommands).toHaveLength(50);
    expect(context.recentCommands[0]?.command).toBe("echo 5");
    expect(context.recentCommands[49]?.command).toBe("echo 54");
    expect(context.cwdCommandStats["/workspace"]?.frequentCommands[0]?.command).toBe("echo 54");
  });

  it("records recent failures with short sanitized output summaries", () => {
    const context = recordCompletedCommand(createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"), {
      command: "npm test",
      cwd: "/workspace",
      exitCode: 1,
      output: "token=secret-key\nFAIL src/app.test.ts\n".repeat(200),
      completedAt: 10,
    });

    expect(context.recentFailures).toHaveLength(1);
    expect(context.recentFailures[0]?.command).toBe("npm test");
    expect(context.recentFailures[0]?.outputSummary).toContain("FAIL src/app.test.ts");
    expect(context.recentFailures[0]?.outputSummary).not.toContain("secret-key");
    expect((context.recentFailures[0]?.outputSummary.length ?? 0) <= 2048).toBe(true);
  });

  it("records accepted and rejected suggestion feedback in memory only", () => {
    let context = createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash");
    context = recordAcceptedSuggestion(context, {
      source: "ai",
      kind: "intent",
      text: "lsof -i :3000",
      draft: "查看 3000 端口",
      cwd: "/workspace",
      acceptedAt: 20,
    });
    context = recordRejectedAiSuggestions(context, [
      {
        source: "ai",
        kind: "intent",
        text: "netstat -an",
        draft: "查看 3000 端口",
        cwd: "/workspace",
        rejectedAt: 21,
      },
    ]);

    expect(context.acceptedSuggestions).toHaveLength(1);
    expect(context.rejectedAiSuggestions).toHaveLength(1);
  });
});
