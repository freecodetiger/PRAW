import { describe, expect, it } from "vitest";

import {
  consumeAgentWorkflowLifecycleChunk,
  createShellIntegrationParserState,
} from "./shell-integration";

describe("agent workflow output parsing", () => {
  it("extracts lifecycle markers without retaining large visible output", () => {
    const result = consumeAgentWorkflowLifecycleChunk(
      createShellIntegrationParserState(),
      `${"assistant token ".repeat(50_000)}\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07`,
    );

    expect(result.visibleOutput).toBe("");
    expect(result.timeline).toEqual([
      {
        type: "event",
        event: {
          type: "command-end",
          exitCode: 0,
        },
      },
      {
        type: "event",
        event: {
          type: "prompt-state",
          cwd: "/workspace",
        },
      },
    ]);
    expect(result.events).toHaveLength(2);
  });
});
