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

  it("stores transcript output for the active dialog command", () => {
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
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;C;entry=codex\u0007");
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

  it("clears the classic terminal buffer after shell markers confirm agent workflow mode", () => {
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    useTerminalViewStore.getState().appendOutput("tab:1", "previous output\n");

    useTerminalViewStore.getState().submitCommand("tab:1", "codex");
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;C;entry=codex\u0007");

    expect(useTerminalViewStore.getState().buffers[getTerminalBufferKey("tab:1")]).toEqual({
      content: "",
      revision: 2,
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
    useTerminalViewStore
      .getState()
      .consumeOutput(
        "tab:1",
        "\u001b]133;C;entry=ANTHROPIC_AUTH_TOKEN=secret ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic claude --dangerously-skip-permissions --model glm-5\u0007",
      );

    const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
    expect(tabState.presentation).toBe("agent-workflow");
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
    useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;C;entry=codex\u0007");
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
