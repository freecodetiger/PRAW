import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_TERMINAL_BUFFER } from "../../../domain/terminal/buffer";
import { getTerminalBufferKey, useTerminalViewStore } from "./terminal-view-store";

describe("terminal-view-store", () => {
  beforeEach(() => {
    useTerminalViewStore.setState({
      buffers: {},
      tabStates: {},
    });
  });

  it("buffers output per tab", () => {
    useTerminalViewStore.getState().appendOutput("tab:1", "hello");
    useTerminalViewStore.getState().appendOutput("tab:1", "\nworld");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "hello\nworld",
      revision: 2,
    });
  });

  it("resets and removes tab buffers independently", () => {
    useTerminalViewStore.getState().appendOutput("tab:1", "hello");
    useTerminalViewStore.getState().resetTabBuffer("tab:1");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 2,
    });

    useTerminalViewStore.getState().removeTabBuffer("tab:1");
    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")] ?? EMPTY_TERMINAL_BUFFER).toBe(
      EMPTY_TERMINAL_BUFFER,
    );
  });

  it("initializes bash tabs in dialog mode and unsupported shells in classic mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().syncTabState("tab:2", "/usr/bin/zsh", "/workspace");

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")]).toMatchObject({
      mode: "dialog",
      shellIntegration: "supported",
      cwd: "/workspace",
    });

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:2")]).toMatchObject({
      mode: "classic",
      shellIntegration: "unsupported",
      modeSource: "shell-unsupported",
    });
  });

  it("submits commands, routes output, and closes the block on shell end markers", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().submitCommand("tab:1", "ls");
    useTerminalViewStore.getState().consumeOutput("tab:1", "file-a\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.activeCommandBlockId).toBeNull();
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\n",
        status: "completed",
        exitCode: 0,
      }),
    ]);
  });

  it("keeps transcript and shell state isolated per tab", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace/app");
    useTerminalViewStore.getState().syncTabState("tab:2", "/bin/bash", "/workspace/api");

    useTerminalViewStore.getState().submitCommand("tab:1", "pwd");
    useTerminalViewStore.getState().consumeOutput("tab:1", "/workspace/app\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")].blocks).toHaveLength(1);
    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:2")].blocks).toEqual([]);
  });

  it("suppresses transcript streaming while an agent workflow command owns the tab", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().submitCommand("tab:1", "codex");
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

  it("returns to dialog presentation after an agent workflow command exits", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().submitCommand("tab:1", "claude");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.mode).toBe("dialog");
    expect(tabState.modeSource).toBe("default");
    expect(tabState.presentation).toBe("default");
  });
});
