import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_TERMINAL_BUFFER } from "../../../domain/terminal/buffer";
import { useTerminalViewStore, getTerminalBufferKey, selectTerminalTabState } from "./terminal-view-store";

describe("terminal-view-store", () => {
  beforeEach(() => {
    useTerminalViewStore.setState({
      buffers: {},
      tabStates: {},
      appendOutput: useTerminalViewStore.getState().appendOutput,
      resetTabBuffer: useTerminalViewStore.getState().resetTabBuffer,
      removeTabBuffer: useTerminalViewStore.getState().removeTabBuffer,
      syncTabState: useTerminalViewStore.getState().syncTabState,
      submitCommand: useTerminalViewStore.getState().submitCommand,
      consumeOutput: useTerminalViewStore.getState().consumeOutput,
      consumeSemantic: useTerminalViewStore.getState().consumeSemantic,
      setTabMode: useTerminalViewStore.getState().setTabMode,
      resetTabState: useTerminalViewStore.getState().resetTabState,
      removeTabState: useTerminalViewStore.getState().removeTabState,
    });
  });

  it("returns empty buffers for untouched tabs", () => {
    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:missing")] ?? EMPTY_TERMINAL_BUFFER).toEqual(
      EMPTY_TERMINAL_BUFFER,
    );
  });

  it("creates dialog-aware tab state when a bash tab is synced", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");

    expect(selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1")).toMatchObject({
      shell: "/bin/bash",
      cwd: "/workspace",
      mode: "dialog",
      shellIntegration: "supported",
    });
  });

  it("keeps running output out of transcript until the command exits", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "ls --color=always");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b[01;34msrc\u001b[0m\n");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.liveConsole?.transcriptCapture).toBe("\u001b[01;34msrc\u001b[0m\n");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "ls --color=always",
        output: "",
        status: "running",
      }),
    ]);
  });

  it("commits captured live console output into the transcript when the command exits", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "ls --color=always");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b[01;34msrc\u001b[0m\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.dialogPhase).toBe("idle");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "ls --color=always",
        output: "\u001b[01;34msrc\u001b[0m\n",
        status: "completed",
      }),
    ]);
  });

  it("keeps ordinary long-running commands in dialog mode while exposing PTY input", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "git push origin main");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.mode).toBe("dialog");
    expect(tabState.modeSource).toBe("default");
    expect(tabState.composerMode).toBe("pty");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "git push origin main",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("keeps transcript and shell state isolated per tab", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace/app", "dialog");
    useTerminalViewStore.getState().syncTabState("tab:2", "/bin/bash", "/workspace/api", "dialog");

    useTerminalViewStore.getState().submitCommand("tab:1", "pwd");
    useTerminalViewStore.getState().consumeOutput("tab:1", "/workspace/app\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")].blocks).toHaveLength(1);
    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:2")].blocks).toEqual([]);
  });

  it("suppresses transcript streaming while an agent workflow command owns the tab", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "codex");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    useTerminalViewStore.getState().consumeOutput("tab:1", "thinking...\n");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "codex",
        output: "",
        status: "running",
      }),
    ]);
  });

  it("enters agent workflow presentation for qwen code shell markers", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "qwen code");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "qwen code",
    });

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(tabState.mode).toBe("classic");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "qwen code",
        output: "",
        status: "running",
      }),
    ]);
  });

  it("enters agent workflow presentation for bare qwen shell markers", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "qwen");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "qwen",
    });

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(tabState.mode).toBe("classic");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "qwen",
        output: "",
        status: "running",
      }),
    ]);
  });

  it("clears the classic terminal buffer after shell markers confirm agent workflow mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().appendOutput("tab:1", "previous output\n");

    useTerminalViewStore.getState().submitCommand("tab:1", "codex");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 3,
    });
  });

  it("also clears the classic terminal buffer for environment-prefixed AI workflow markers", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().appendOutput("tab:1", "previous output\n");

    useTerminalViewStore
      .getState()
      .submitCommand(
        "tab:1",
        "ANTHROPIC_AUTH_TOKEN=secret ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic claude --dangerously-skip-permissions --model glm-5",
      );
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry:
        "ANTHROPIC_AUTH_TOKEN=secret ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic claude --dangerously-skip-permissions --model glm-5",
    });

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 3,
    });
  });

  it("returns to the preferred mode after an agent workflow command exits", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "classic");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "claude",
    });
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.mode).toBe("classic");
    expect(tabState.modeSource).toBe("default");
    expect(tabState.presentation).toBe("default");
    expect(tabState.preferredMode).toBe("classic");
  });

  it("drops split OSC color reports after agent workflow exit instead of appending a session block", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "codex");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]10;rgb:0000/0000/0001");
    useTerminalViewStore.getState().consumeOutput("tab:1", ";rgb:ffff/ffff/fff1\u001b\\");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.mode).toBe("dialog");
    expect(tabState.presentation).toBe("default");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "codex",
        output: "",
        status: "completed",
        exitCode: 0,
      }),
    ]);
  });

  it("upgrades an active dialog command to classic mode when backend semantics require full terminal ownership", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "custom-dashboard");
    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "classic-required",
      reason: "alternate-screen",
      confidence: "strong",
      commandEntry: "custom-dashboard",
    });
    useTerminalViewStore.getState().appendOutput("tab:1", "\u001b[?1049h\u001b[2J");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b[?1049h\u001b[2J");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.mode).toBe("classic");
    expect(tabState.modeSource).toBe("auto-interactive");
    expect(tabState.composerMode).toBe("pty");
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "custom-dashboard",
        output: "",
        status: "running",
      }),
    ]);
    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "\u001b[?1049h\u001b[2J",
      revision: 2,
    });
  });

  it("clears the classic terminal buffer when backend semantic events enter agent workflow mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "classic");
    useTerminalViewStore.getState().appendOutput("tab:1", "old prompt\n");

    useTerminalViewStore.getState().consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 2,
    });

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(tabState.mode).toBe("classic");
  });
});
