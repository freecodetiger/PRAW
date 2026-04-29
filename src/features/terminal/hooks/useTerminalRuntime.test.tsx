// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { createDialogState } from "../../../domain/terminal/dialog";
import type { TerminalOutputEvent, TerminalSemanticEvent } from "../../../domain/terminal/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { clearRegistry, getTerminalSnapshot, registerTerminal } from "../lib/terminal-registry";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { useTerminalRuntime } from "./useTerminalRuntime";

const terminalApi = vi.hoisted(() => {
  let outputHandler: ((event: TerminalOutputEvent) => void) | null = null;
  let semanticHandler: ((event: TerminalSemanticEvent) => void) | null = null;

  return {
    emitOutput: (event: TerminalOutputEvent) => {
      outputHandler?.(event);
    },
    emitSemantic: (event: TerminalSemanticEvent) => {
      semanticHandler?.(event);
    },
    createTerminalSession: vi.fn(async () => ({
      sessionId: "session-created",
      shell: "/bin/bash",
      cwd: "/workspace",
    })),
    closeTerminalSession: vi.fn(async () => undefined),
    onTerminalOutput: vi.fn(async (handler: (event: TerminalOutputEvent) => void) => {
      outputHandler = handler;
      return () => {
        if (outputHandler === handler) {
          outputHandler = null;
        }
      };
    }),
    onTerminalExit: vi.fn(async () => () => undefined),
    onTerminalSemantic: vi.fn(async (handler: (event: TerminalSemanticEvent) => void) => {
      semanticHandler = handler;
      return () => {
        if (semanticHandler === handler) {
          semanticHandler = null;
        }
      };
    }),
  };
});

vi.mock("../../../lib/tauri/terminal", () => ({
  createTerminalSession: terminalApi.createTerminalSession,
  closeTerminalSession: terminalApi.closeTerminalSession,
  onTerminalOutput: terminalApi.onTerminalOutput,
  onTerminalExit: terminalApi.onTerminalExit,
  onTerminalSemantic: terminalApi.onTerminalSemantic,
}));

function RuntimeHarness() {
  useTerminalRuntime();
  return null;
}

async function flushTerminalOutput() {
  await act(async () => {
    if (vi.isFakeTimers()) {
      vi.advanceTimersByTime(20);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await Promise.resolve();
  });
}

describe("useTerminalRuntime", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    clearRegistry();
    terminalApi.createTerminalSession.mockClear();
    terminalApi.closeTerminalSession.mockClear();
    terminalApi.onTerminalOutput.mockClear();
    terminalApi.onTerminalExit.mockClear();
    terminalApi.onTerminalSemantic.mockClear();

    useAppConfigStore.setState((state) => ({
      ...state,
      config: DEFAULT_APP_CONFIG,
    }));

    useWorkspaceStore.setState((state) => ({
      ...state,
      workspaceCollection: null,
      activeWorkspaceId: null,
      window: {
        layout: {
          kind: "pane",
          id: "pane:tab:1",
          paneId: "tab:1",
        },
        tabs: {
          "tab:1": {
            tabId: "tab:1",
            title: "Tab 1",
            shell: "/bin/bash",
            cwd: "/workspace",
            status: "running",
            sessionId: "session-1",
          },
        },
        activeTabId: "tab:1",
        nextTabNumber: 2,
      },
      focusMode: null,
      dragState: null,
      dragPreview: null,
      noteEditorTabId: null,
    }));

    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "classic",
          modeSource: "auto-interactive",
          presentation: "agent-workflow",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
          aiSession: {
            provider: "codex",
            rawOnly: true,
          },
        },
      },
    }));

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    clearRegistry();
    vi.useRealTimers();
  });

  it("clears pre-AI shell output when the tab first transitions into agent workflow mode", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "dialog",
          modeSource: "default",
          presentation: "default",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
        },
      },
    }));

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "zpc@zpc:~$ ls\nDesktop\n",
      });
    });
    await flushTerminalOutput();

    expect(getTerminalSnapshot("tab:1").content).toContain("Desktop");

    await act(async () => {
      terminalApi.emitSemantic({
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry: "codex",
      });
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "OpenAI Codex\n",
      });
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    await flushTerminalOutput();

    expect(getTerminalSnapshot("tab:1").content).toBe("OpenAI Codex\n");
  });

  it("does not replay the shell prompt prefix from the agent workflow marker chunk after semantic reset", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "dialog",
          modeSource: "default",
          presentation: "default",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
        },
      },
    }));

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitSemantic({
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry: "codex",
      });
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "zpc@zpc:~/projects/praw$ codex\r\n\x1b]133;C;entry=codex\x07OpenAI Codex\n",
      });
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    await flushTerminalOutput();

    const snapshot = getTerminalSnapshot("tab:1").content;
    expect(snapshot).toBe("OpenAI Codex\n");
    expect(snapshot).not.toContain("zpc@zpc");
  });

  it("keeps the agent startup frame when output arrives before the semantic event", async () => {
    vi.useFakeTimers();
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "dialog",
          modeSource: "default",
          presentation: "default",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
        },
      },
    }));

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "zpc@zpc:~$ claude\r\n\x1b]133;C;entry=claude\x07\x1b]133;PRAW_AGENT;provider=claude\x07Claude Code\n",
      });
      await Promise.resolve();
    });

    expect(getTerminalSnapshot("tab:1").content).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitSemantic({
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry: "claude",
      });
    });

    const snapshot = getTerminalSnapshot("tab:1").content;
    expect(snapshot).toBe("Claude Code\n");
    expect(snapshot).not.toContain("zpc@zpc");
  });

  it("hard-resets terminal state when the tab first transitions into agent workflow mode", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "dialog",
          modeSource: "default",
          presentation: "default",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
        },
      },
    }));

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "zpc@zpc:~$ z",
      });
    });
    await flushTerminalOutput();

    expect(getTerminalSnapshot("tab:1").content).toContain("z");

    await act(async () => {
      terminalApi.emitSemantic({
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry: "codex",
      });
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "OpenAI Codex\n",
      });
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    await flushTerminalOutput();

    expect(getTerminalSnapshot("tab:1").content).toBe("OpenAI Codex\n");
  });

  it("mirrors PTY output to the raw terminal snapshot for agent workflow tabs in raw-only mode", async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "assistant: hello from raw-only mode\n",
      });
      await Promise.resolve();
    });

    expect(getTerminalSnapshot("tab:1").content).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(getTerminalSnapshot("tab:1").content).toContain("assistant: hello from raw-only mode\n");
    vi.useRealTimers();
  });

  it("flushes buffered agent workflow output before command-end lifecycle handling", async () => {
    vi.useFakeTimers();
    const controller = createController();
    registerTerminal("tab:1", controller);

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "assistant: final line\n\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07",
      });
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(controller.writeDirect).toHaveBeenCalledWith(
      "assistant: final line\n\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07",
    );
    expect(controller.clear).toHaveBeenCalled();
    expect(controller.writeDirect.mock.invocationCallOrder[0]).toBeLessThan(
      controller.clear.mock.invocationCallOrder[0],
    );
  });

  it("defers PTY output work so bursty agent output does not block the current event turn", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(<RuntimeHarness />);
        await Promise.resolve();
      });

      act(() => {
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "first burst\n",
        });
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "second burst\n",
        });
      });

      expect(getTerminalSnapshot("tab:1").content).toBe("");

      await act(async () => {
        vi.advanceTimersByTime(0);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toBe("");

      await act(async () => {
        vi.advanceTimersByTime(15);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toBe("");

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toBe("first burst\nsecond burst\n");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops queued shell output when a tab resets into agent workflow mode before the queue flushes", async () => {
    vi.useFakeTimers();

    try {
      useTerminalViewStore.setState((state) => ({
        ...state,
        tabStates: {
          "tab:1": {
            ...createDialogState("/bin/bash", "/workspace"),
            mode: "dialog",
            modeSource: "default",
            presentation: "default",
            shell: "/bin/bash",
            parserState: createShellIntegrationParserState(),
          },
        },
      }));

      await act(async () => {
        root.render(<RuntimeHarness />);
        await Promise.resolve();
      });

      act(() => {
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "zpc@zpc:~$ claude",
        });
        terminalApi.emitSemantic({
          sessionId: "session-1",
          kind: "agent-workflow",
          reason: "shell-entry",
          confidence: "strong",
          commandEntry: "claude",
        });
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "\r\n\x1b]133;C;entry=claude\x07Claude Code\n",
        });
      });

      await act(async () => {
        vi.runOnlyPendingTimers();
        await Promise.resolve();
      });

      const snapshot = getTerminalSnapshot("tab:1").content;
      expect(snapshot).toBe("Claude Code\n");
      expect(snapshot).not.toContain("zpc@zpc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes large PTY output in small chunks to keep input responsive during backlog catch-up", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(<RuntimeHarness />);
        await Promise.resolve();
      });

      act(() => {
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "x".repeat(10_000),
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toHaveLength(4096);

      await act(async () => {
        vi.advanceTimersByTime(16);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toHaveLength(8192);
    } finally {
      vi.useRealTimers();
    }
  });

  it("compacts agent workflow output backlog instead of replaying every visual frame", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(<RuntimeHarness />);
        await Promise.resolve();
      });

      act(() => {
        terminalApi.emitOutput({
          sessionId: "session-1",
          data: "a".repeat(40_000),
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        await Promise.resolve();
      });

      const snapshot = getTerminalSnapshot("tab:1").content;
      expect(snapshot.length).toBeLessThan(40_000);
      expect(snapshot).toHaveLength(4096);

      await act(async () => {
        vi.advanceTimersByTime(16);
        await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        await Promise.resolve();
      });

      expect(getTerminalSnapshot("tab:1").content).toHaveLength(8192);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts terminal sessions for inactive workspace tabs", async () => {
    terminalApi.createTerminalSession.mockImplementation(async (request?: any) => ({
      sessionId: request.sessionId,
      shell: request.shell,
      cwd: request.cwd,
    }));

    useWorkspaceStore.setState((state) => ({
      ...state,
      activeWorkspaceId: "ws:1",
      workspaceCollection: {
        version: 1,
        activeWorkspaceId: "ws:1",
        nextWorkspaceNumber: 3,
        workspaces: [
          {
            workspaceId: "ws:1",
            title: "Workspace 1",
            createdAt: 1,
            updatedAt: 1,
            window: {
              layout: { kind: "pane", id: "pane:ws:1:tab:1", paneId: "ws:1:tab:1" },
              tabs: {
                "ws:1:tab:1": {
                  tabId: "ws:1:tab:1",
                  title: "Tab 1",
                  shell: "/bin/bash",
                  cwd: "/workspace",
                  status: "running",
                  sessionId: "session-1",
                },
              },
              activeTabId: "ws:1:tab:1",
              nextTabNumber: 2,
            },
          },
          {
            workspaceId: "ws:2",
            title: "Workspace 2",
            createdAt: 2,
            updatedAt: 2,
            window: {
              layout: { kind: "pane", id: "pane:ws:2:tab:1", paneId: "ws:2:tab:1" },
              tabs: {
                "ws:2:tab:1": {
                  tabId: "ws:2:tab:1",
                  title: "Tab 1",
                  shell: "/bin/zsh",
                  cwd: "/workspace/ui",
                  status: "starting",
                },
              },
              activeTabId: "ws:2:tab:1",
              nextTabNumber: 2,
            },
          },
        ],
      },
      window: {
        layout: { kind: "pane", id: "pane:ws:1:tab:1", paneId: "ws:1:tab:1" },
        tabs: {
          "ws:1:tab:1": {
            tabId: "ws:1:tab:1",
            title: "Tab 1",
            shell: "/bin/bash",
            cwd: "/workspace",
            status: "running",
            sessionId: "session-1",
          },
        },
        activeTabId: "ws:1:tab:1",
        nextTabNumber: 2,
      },
    }) as any);

    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    expect(terminalApi.createTerminalSession).toHaveBeenCalledWith(
      expect.objectContaining({
        shell: "/bin/zsh",
        cwd: "/workspace/ui",
      }),
    );
    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces[1].window.tabs["ws:2:tab:1"]).toMatchObject({
      status: "running",
      shell: "/bin/zsh",
      cwd: "/workspace/ui",
    });
  });
});

function createController() {
  return {
    writeDirect: vi.fn((_data: string) => undefined),
    pasteText: vi.fn(),
    sendEnter: vi.fn(),
    clear: vi.fn(() => undefined),
    focus: vi.fn(),
    blur: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelectionText: vi.fn(() => ""),
  } satisfies Parameters<typeof registerTerminal>[1];
}
