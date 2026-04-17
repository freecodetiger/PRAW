import { describe, expect, it } from "vitest";

import { consumeShellIntegrationChunk, createShellIntegrationParserState } from "./shell-integration";

function createReadyState() {
  return {
    ...createShellIntegrationParserState(),
    shellReady: true,
  };
}

describe("shell integration parser", () => {
  it("strips shell markers and emits lifecycle events", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
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
      createReadyState(),
      `\x1b]133;C;entry=codex\x07output`,
    );

    expect(result.visibleOutput).toBe("output");
    expect(result.events).toEqual([{ type: "command-start", entry: "codex" }]);
  });

  it("holds partial marker data until the sequence is complete", () => {
    const first = consumeShellIntegrationChunk(createReadyState(), "a\x1b]133;P;cwd=/wo");
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
      createReadyState(),
      `\x1b]133;A\x07zpc@host:~/proj$ \x1b]133;B\x07plain output`,
    );

    expect(result.visibleOutput).toBe("plain output");
    expect(result.events).toEqual([]);
  });

  it("ignores startup noise until the first shell-ready prompt-state marker arrives", () => {
    const result = consumeShellIntegrationChunk(
      {
        ...createShellIntegrationParserState(),
        shellReady: false,
      },
      `/Users/s/.zshrc:1: command not found: fnm\n\x1b]133;P;cwd=/Users/s\x07`,
    );

    expect(result.visibleOutput).toBe("");
    expect(result.events).toEqual([{ type: "prompt-state", cwd: "/Users/s" }]);
    expect(result.state.shellReady).toBe(true);
  });

  it("parses shell markers that use the ST terminator", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
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
      createReadyState(),
      "\u001b]10;rgb:0000/0000/0001",
    );

    expect(first.visibleOutput).toBe("");
    expect(first.events).toEqual([]);

    const second = consumeShellIntegrationChunk(first.state, ";rgb:ffff/ffff/fff1\u001b\\ready\n");
    expect(second.visibleOutput).toBe("ready\n");
    expect(second.events).toEqual([]);
    expect(second.state.pending).toBe("");
  });

  it("strips alternate-screen control sequences from visible transcript output", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
      "loading\u001b[?1049h\u001b[2J",
    );

    expect(result.visibleOutput).toBe("loading");
  });

  it("keeps ordinary command output stable when bash toggles bracketed paste mode", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
      "\u001b[?2004lfile-a\nfile-b\n\u001b[?2004h",
    );

    expect(result.visibleOutput).toBe("file-a\nfile-b\n");
  });

  it("removes zsh line-redraw backspaces from visible output", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
      "e\becho hello\n",
    );

    expect(result.visibleOutput).toBe("echo hello\n");
  });

  it("collapses carriage-return progress updates into the latest visible line", () => {
    const result = consumeShellIntegrationChunk(
      createReadyState(),
      "处理 delta 中:  14% (238/1697)\r处理 delta 中:  15% (255/1697)\r处理 delta 中:  16% (272/1697)",
    );

    expect(result.visibleOutput).toBe("处理 delta 中:  16% (272/1697)");
  });

  it("preserves CRLF line endings while still treating bare carriage returns as line rewrites", () => {
    const first = consumeShellIntegrationChunk(
      createReadyState(),
      "Receiving objects: 10%\r",
    );

    expect(first.visibleOutput).toBe("Receiving objects: 10%");

    const second = consumeShellIntegrationChunk(first.state, "\nReceiving objects: 11%\rReceiving objects: 12%");
    expect(second.visibleOutput).toBe("\nReceiving objects: 12%");
  });

});
