import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_TERMINAL_BUFFER } from "../../../domain/terminal/buffer";
import { getTerminalBufferKey, useTerminalViewStore } from "./terminal-view-store";

describe("terminal-view-store", () => {
  beforeEach(() => {
    useTerminalViewStore.setState({
      buffers: {},
      paneStates: {},
    });
  });

  it("buffers output per pane", () => {
    useTerminalViewStore.getState().appendOutput("tab:1", "pane:main", "hello");
    useTerminalViewStore.getState().appendOutput("tab:1", "pane:main", "\nworld");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1", "pane:main")]).toEqual({
      content: "hello\nworld",
      revision: 2,
    });
  });

  it("resets and removes pane buffers independently", () => {
    useTerminalViewStore.getState().appendOutput("tab:1", "pane:main", "hello");
    useTerminalViewStore.getState().resetPaneBuffer("tab:1", "pane:main");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1", "pane:main")]).toEqual({
      content: "",
      revision: 2,
    });

    useTerminalViewStore.getState().removePaneBuffer("tab:1", "pane:main");
    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1", "pane:main")] ?? EMPTY_TERMINAL_BUFFER).toBe(
      EMPTY_TERMINAL_BUFFER,
    );
  });

  it("initializes bash panes in dialog mode and unsupported shells in classic mode", () => {
    useTerminalViewStore.getState().syncPaneState("tab:1", "pane:main", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().syncPaneState("tab:1", "pane:2", "/usr/bin/zsh", "/workspace");

    expect(useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:main")]).toMatchObject({
      mode: "dialog",
      shellIntegration: "supported",
      cwd: "/workspace",
    });

    expect(useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:2")]).toMatchObject({
      mode: "classic",
      shellIntegration: "unsupported",
      modeSource: "shell-unsupported",
    });
  });

  it("submits commands, routes output, and closes the block on shell end markers", () => {
    useTerminalViewStore.getState().syncPaneState("tab:1", "pane:main", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().submitCommand("tab:1", "pane:main", "ls");
    useTerminalViewStore.getState().consumeOutput("tab:1", "pane:main", "file-a\n");
    useTerminalViewStore.getState().consumeOutput("tab:1", "pane:main", "\u001b]133;D;0\u0007");

    const paneState = useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:main")];
    expect(paneState.activeCommandBlockId).toBeNull();
    expect(paneState.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\n",
        status: "completed",
        exitCode: 0,
      }),
    ]);
  });

  it("auto-switches interactive commands to classic mode and returns after completion", () => {
    useTerminalViewStore.getState().syncPaneState("tab:1", "pane:main", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().submitCommand("tab:1", "pane:main", "top");

    let paneState = useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:main")];
    expect(paneState.mode).toBe("classic");
    expect(paneState.modeSource).toBe("auto-interactive");

    useTerminalViewStore.getState().consumeOutput("tab:1", "pane:main", "\u001b]133;D;0\u0007");
    paneState = useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:main")];
    expect(paneState.mode).toBe("dialog");
    expect(paneState.modeSource).toBe("default");
  });

  it("does not append classic-mode transcript noise when the user manually stays in classic mode", () => {
    useTerminalViewStore.getState().syncPaneState("tab:1", "pane:main", "/bin/bash", "/workspace");
    useTerminalViewStore.getState().setPaneMode("tab:1", "pane:main", "classic", "manual");
    useTerminalViewStore
      .getState()
      .consumeOutput("tab:1", "pane:main", "zpc@host:/workspace$ \u001b]133;P;cwd=/workspace/subdir\u0007");

    const paneState = useTerminalViewStore.getState().paneStates[getTerminalBufferKey("tab:1", "pane:main")];
    expect(paneState.blocks).toEqual([]);
    expect(paneState.cwd).toBe("/workspace/subdir");
  });
});
