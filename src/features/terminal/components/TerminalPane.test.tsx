// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalPane } from "./TerminalPane";

const terminalApi = vi.hoisted(() => ({
  submitTerminalAgentPrompt: vi.fn(async () => undefined),
  listCodexSessions: vi.fn<() => Promise<Array<{
    id: string;
    cwd: string;
    timestamp: string;
    latestPrompt?: string | null;
  }>>>(async () => []),
  resetTerminalAgentSession: vi.fn(async () => undefined),
  attachTerminalAgentSession: vi.fn(async () => undefined),
  setTerminalAgentModel: vi.fn(async () => undefined),
  runTerminalAgentReview: vi.fn(async () => "review summary"),
}));

vi.mock("../../../lib/tauri/terminal", () => ({
  submitTerminalAgentPrompt: terminalApi.submitTerminalAgentPrompt,
  listCodexSessions: terminalApi.listCodexSessions,
  resetTerminalAgentSession: terminalApi.resetTerminalAgentSession,
  attachTerminalAgentSession: terminalApi.attachTerminalAgentSession,
  setTerminalAgentModel: terminalApi.setTerminalAgentModel,
  runTerminalAgentReview: terminalApi.runTerminalAgentReview,
}));

vi.mock("../hooks/useTerminalSession", () => ({
  useTerminalSession: () => ({
    tab: useWorkspaceStore.getState().window?.tabs["tab:1"] ?? null,
    currentStreamSessionId: "session-1",
    write: async () => undefined,
    resize: async () => undefined,
    restart: async () => undefined,
    terminate: async () => undefined,
  }),
}));

let latestBlockWorkspaceProps: Record<string, unknown> | null = null;

vi.mock("./BlockWorkspaceSurface", () => ({
  BlockWorkspaceSurface: (props: Record<string, unknown>) => {
    latestBlockWorkspaceProps = props;
    return <div data-testid="block-workspace-surface" />;
  },
}));

vi.mock("./PaneHeaderActionCluster", () => ({
  PaneHeaderActionCluster: () => <div data-testid="pane-header-actions" />,
}));

describe("TerminalPane", () => {
  let host: HTMLDivElement;
  let root: Root;
  class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    latestBlockWorkspaceProps = null;
    terminalApi.submitTerminalAgentPrompt.mockClear();
    terminalApi.listCodexSessions.mockReset();
    terminalApi.resetTerminalAgentSession.mockClear();
    terminalApi.attachTerminalAgentSession.mockClear();
    terminalApi.setTerminalAgentModel.mockClear();
    terminalApi.runTerminalAgentReview.mockClear();

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
    vi.unstubAllGlobals();
  });

  it("routes every terminal tab to the unified block workspace surface", () => {
    act(() => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(host.querySelector('[data-testid="block-workspace-surface"]')).not.toBeNull();
    expect(latestBlockWorkspaceProps?.paneState).toMatchObject({
      presentation: "agent-workflow",
    });
  });

  it("uses the same block workspace surface for non-AI command tabs instead of falling back to classic mode", () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          mode: "classic",
          modeSource: "auto-interactive",
          presentation: "default",
          shell: "/bin/bash",
          parserState: createShellIntegrationParserState(),
        },
      },
    }));

    act(() => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(host.querySelector('[data-testid="block-workspace-surface"]')).not.toBeNull();
    expect(latestBlockWorkspaceProps?.paneState).toMatchObject({
      presentation: "default",
      mode: "classic",
    });
  });

  it("handles local slash help inside the AI composer without touching the bridge", async () => {
    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(latestBlockWorkspaceProps).not.toBeNull();

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/help");
    });

    expect(terminalApi.submitTerminalAgentPrompt).not.toHaveBeenCalled();

    const tabState = useTerminalViewStore.getState().tabStates["tab:1"];
    const entries = tabState.aiTranscript?.entries ?? [];
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry).toMatchObject({
      kind: "system",
      tone: "info",
    });
    expect(lastEntry?.text).toContain("/resume");
  });

  it("loads Codex sessions for /resume and attaches the selected session through the structured bridge", async () => {
    terminalApi.listCodexSessions.mockResolvedValue([
      {
        id: "codex-session-1",
        cwd: "/workspace",
        timestamp: "2026-04-15T00:00:00.000Z",
        latestPrompt: "investigate flaky tests",
      },
    ]);

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/resume");
    });

    expect(terminalApi.listCodexSessions).toHaveBeenCalledTimes(1);
    expect(latestBlockWorkspaceProps?.resumePicker).toMatchObject({
      open: true,
      sessions: [
        {
          id: "codex-session-1",
        },
      ],
    });

    await act(async () => {
      await (latestBlockWorkspaceProps?.resumePicker as { onSelect: (value: string) => Promise<void> }).onSelect(
        "codex-session-1",
      );
    });

    expect(terminalApi.attachTerminalAgentSession).toHaveBeenCalledWith("session-1", "codex-session-1");
    const tabState = useTerminalViewStore.getState().tabStates["tab:1"];
    expect(tabState.aiTranscript?.entries).toEqual([
      expect.objectContaining({
        kind: "system",
        text: expect.stringContaining("codex-session-1"),
      }),
    ]);
  });
});
