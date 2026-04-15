import { beforeEach, describe, expect, it } from "vitest";

import { clearRegistry, updateArchiveText, writeDirect } from "../lib/terminal-registry";
import { selectTerminalTabState, useTerminalViewStore } from "./terminal-view-store";

describe("terminal-view-store AI transcript", () => {
  beforeEach(() => {
    clearRegistry();
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {},
    }));
  });

  it("records prompts and ignores PTY-visible output for agent workflow transcripts", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    store.recordAiPrompt("tab:1", "refine the answer");
    store.consumeOutput("tab:1", "STREAMING\nWorking(14s)\n› ping\n");
    store.consumeAgentEvent("tab:1", {
      sessionId: "session-1",
      provider: "codex",
      type: "assistant-message",
      text: "pong",
    });
    store.consumeAgentEvent("tab:1", {
      sessionId: "session-1",
      provider: "codex",
      type: "turn-complete",
    });

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiTranscript?.entries).toEqual([
      {
        id: expect.any(String),
        kind: "prompt",
        text: "refine the answer",
      },
      {
        id: expect.any(String),
        kind: "output",
        text: "pong",
        status: "completed",
      },
    ]);
  });

  it("records local AI command feedback and can clear the transcript for a new session", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    store.recordAiPrompt("tab:1", "old prompt");
    store.recordAiSystemMessage("tab:1", "Started a fresh Codex conversation.");
    store.clearAiTranscript("tab:1");
    store.recordAiSystemMessage("tab:1", "New conversation ready.");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiTranscript?.entries).toEqual([
      {
        id: expect.any(String),
        kind: "system",
        text: "New conversation ready.",
        tone: "info",
      },
    ]);
  });

  it("stores structured runtime capabilities from bridge-state events", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "qwen",
    });
    store.consumeAgentEvent("tab:1", {
      sessionId: "session-1",
      provider: "qwen",
      type: "bridge-state",
      mode: "structured",
      state: "ready",
      fallbackReason: null,
      capabilities: {
        supportsResumePicker: false,
        supportsDirectResume: true,
        supportsReview: false,
        supportsModelOverride: true,
        showsBypassCapsule: true,
      },
    });

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.agentBridge?.capabilities).toMatchObject({
      supportsDirectResume: true,
      supportsModelOverride: true,
      showsBypassCapsule: true,
    });
  });

  it("captures idle output into DOM blocks even when legacy mode state says classic", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/usr/bin/fish", "/workspace", "dialog");
    store.consumeOutput("tab:1", "unsupported shell output\n");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "session",
        output: "unsupported shell output\n",
      }),
    ]);
  });

  it("keeps prompt-reported cwd when a stale workspace sync runs after pane focus changes", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/home/zpc", "dialog");
    const promptCwd = store.consumeOutput("tab:1", "\x1b]133;P;cwd=/home/zpc/projects/praw\x07");
    store.syncTabState("tab:1", "/bin/bash", "/home/zpc", "dialog");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(promptCwd).toBe("/home/zpc/projects/praw");
    expect(tabState?.cwd).toBe("/home/zpc/projects/praw");
  });

  it("does not create a session output block for prompt-only whitespace after a command ends", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "pwd");
    writeDirect("tab:1", "/workspace\n");
    updateArchiveText("tab:1", "/workspace\n");
    store.consumeOutput("tab:1", "/workspace\n\x1b]133;D;0\x07");
    store.consumeOutput("tab:1", "\r\n\x1b]133;P;cwd=/workspace\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "pwd",
        output: "/workspace\n",
      }),
    ]);
  });

  it("finalizes command output from terminal archive instead of live visible output", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "git clone https://example.com/repo.git");
    store.consumeOutput("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");

    let tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone https://example.com/repo.git",
        output: "",
      }),
    ]);

    writeDirect("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");
    updateArchiveText("tab:1", "Receiving objects: 100%\nDone.");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

    tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone https://example.com/repo.git",
        output: "Receiving objects: 100%\nDone.",
      }),
    ]);
  });

  it("archives only the final visible progress state for git clone style output", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "git clone repo");
    updateArchiveText("tab:1", "处理 delta 中: 100% (1697/1697)，完成。");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone repo",
        output: "处理 delta 中: 100% (1697/1697)，完成。",
      }),
    ]);
  });
});
