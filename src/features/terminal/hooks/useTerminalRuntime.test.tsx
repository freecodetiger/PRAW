// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { createDialogState } from "../../../domain/terminal/dialog";
import type { TerminalOutputEvent } from "../../../domain/terminal/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { clearRegistry, getTerminalSnapshot } from "../lib/terminal-registry";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { useTerminalRuntime } from "./useTerminalRuntime";

const terminalApi = vi.hoisted(() => {
  let outputHandler: ((event: TerminalOutputEvent) => void) | null = null;

  return {
    emitOutput: (event: TerminalOutputEvent) => {
      outputHandler?.(event);
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
    onTerminalSemantic: vi.fn(async () => () => undefined),
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
  });

  it("mirrors PTY output to the raw terminal snapshot for agent workflow tabs in raw-only mode", async () => {
    await act(async () => {
      root.render(<RuntimeHarness />);
      await Promise.resolve();
    });

    await act(async () => {
      terminalApi.emitOutput({
        sessionId: "session-1",
        data: "assistant: hello from raw-only mode\n",
      });
    });

    expect(getTerminalSnapshot("tab:1").content).toContain("assistant: hello from raw-only mode\n");
  });
});
