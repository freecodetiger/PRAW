import { describe, expect, it } from "vitest";

import { consumeShellIntegrationChunk, createShellIntegrationParserState } from "./shell-integration";

describe("shell integration parser", () => {
  it("strips shell markers and emits lifecycle events", () => {
    const result = consumeShellIntegrationChunk(
      createShellIntegrationParserState(),
      `hello\x1b]133;C\x07world\x1b]133;D;7\x07!\x1b]133;P;cwd=/tmp\x07`,
    );

    expect(result.visibleOutput).toBe("helloworld!");
    expect(result.events).toEqual([
      { type: "command-start" },
      { type: "command-end", exitCode: 7 },
      { type: "prompt-state", cwd: "/tmp" },
    ]);
    expect(result.state.pending).toBe("");
  });

  it("parses command entry markers when present", () => {
    const result = consumeShellIntegrationChunk(
      createShellIntegrationParserState(),
      `\x1b]133;C;entry=codex\x07output`,
    );

    expect(result.visibleOutput).toBe("output");
    expect(result.events).toEqual([{ type: "command-start", entry: "codex" }]);
  });

  it("holds partial marker data until the sequence is complete", () => {
    const first = consumeShellIntegrationChunk(createShellIntegrationParserState(), "a\x1b]133;P;cwd=/wo");
    expect(first.visibleOutput).toBe("a");
    expect(first.events).toEqual([]);
    expect(first.state.pending).toBe("\x1b]133;P;cwd=/wo");

    const second = consumeShellIntegrationChunk(first.state, "rkspace\x07b");
    expect(second.visibleOutput).toBe("b");
    expect(second.events).toEqual([{ type: "prompt-state", cwd: "/workspace" }]);
    expect(second.state.pending).toBe("");
  });

  it("suppresses shell prompt text wrapped by prompt markers", () => {
    const result = consumeShellIntegrationChunk(
      createShellIntegrationParserState(),
      `\x1b]133;A\x07zpc@host:~/proj$ \x1b]133;B\x07plain output`,
    );

    expect(result.visibleOutput).toBe("plain output");
    expect(result.events).toEqual([]);
  });

  it("parses shell markers that use the ST terminator", () => {
    const result = consumeShellIntegrationChunk(
      createShellIntegrationParserState(),
      `\u001b]133;C;entry=claude\u001b\\done\u001b]133;D;0\u001b\\`,
    );

    expect(result.visibleOutput).toBe("done");
    expect(result.events).toEqual([
      { type: "command-start", entry: "claude" },
      { type: "command-end", exitCode: 0 },
    ]);
  });

  it("buffers split OSC color reports so they never surface as visible output", () => {
    const first = consumeShellIntegrationChunk(
      createShellIntegrationParserState(),
      "\u001b]10;rgb:0000/0000/0001",
    );

    expect(first.visibleOutput).toBe("");
    expect(first.events).toEqual([]);

    const second = consumeShellIntegrationChunk(first.state, ";rgb:ffff/ffff/fff1\u001b\\ready\n");
    expect(second.visibleOutput).toBe("ready\n");
    expect(second.events).toEqual([]);
    expect(second.state.pending).toBe("");
  });

});
