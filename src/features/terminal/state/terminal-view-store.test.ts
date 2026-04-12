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

  it("initializes bash tabs in the preferred mode and unsupported shells in classic mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().syncTabState("tab:2", "/bin/bash", "/workspace", "classic");
    useTerminalViewStore.getState().syncTabState("tab:3", "/usr/bin/zsh", "/workspace", "dialog");

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")]).toMatchObject({
      mode: "dialog",
      preferredMode: "dialog",
      shellIntegration: "supported",
      cwd: "/workspace",
    });

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:2")]).toMatchObject({
      mode: "classic",
      preferredMode: "classic",
      shellIntegration: "supported",
    });

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:3")]).toMatchObject({
      mode: "classic",
      shellIntegration: "unsupported",
      modeSource: "shell-unsupported",
    });
  });

  it("applies the preferred mode immediately to idle panes", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "classic");

    expect(useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")]).toMatchObject({
      mode: "classic",
      preferredMode: "classic",
      modeSource: "default",
    });
  });

  it("submits commands, routes output, and closes the block on shell end markers", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
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

  it("preserves ANSI color sequences for dialog transcript rendering", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().submitCommand("tab:1", "ls --color=always");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b[01;34msrc\u001b[0m\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.blocks).toEqual([
      expect.objectContaining({
        command: "ls --color=always",
        output: "\u001b[01;34msrc\u001b[0m\n",
        status: "completed",
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

  it("clears the classic terminal buffer before entering agent workflow mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().appendOutput("tab:1", "previous output\n");

    useTerminalViewStore.getState().submitCommand("tab:1", "codex");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 2,
    });
  });

  it("returns to the preferred mode after an agent workflow command exits", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "classic");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;C;entry=claude\u0007");
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


  it("clears the classic terminal buffer when shell markers enter agent workflow mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "classic");
    useTerminalViewStore.getState().appendOutput("tab:1", "old prompt\n");

    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;C;entry=codex\u0007");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 2,
    });

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
    expect(tabState.mode).toBe("classic");
  });

});
