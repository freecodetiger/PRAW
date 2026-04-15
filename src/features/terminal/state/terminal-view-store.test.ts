import { beforeEach, describe, expect, it } from "vitest";

import { selectTerminalTabState, useTerminalViewStore } from "./terminal-view-store";

describe("terminal-view-store AI transcript", () => {
  beforeEach(() => {
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
});
