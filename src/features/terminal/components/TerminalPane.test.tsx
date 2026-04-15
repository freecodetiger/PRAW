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

const aiPromptTransportApi = vi.hoisted(() => ({
  sendAiPrompt: vi.fn(async () => undefined),
}));

vi.mock("../../../lib/tauri/terminal", () => ({
  submitTerminalAgentPrompt: terminalApi.submitTerminalAgentPrompt,
  listCodexSessions: terminalApi.listCodexSessions,
  resetTerminalAgentSession: terminalApi.resetTerminalAgentSession,
  attachTerminalAgentSession: terminalApi.attachTerminalAgentSession,
  setTerminalAgentModel: terminalApi.setTerminalAgentModel,
  runTerminalAgentReview: terminalApi.runTerminalAgentReview,
}));

vi.mock("../lib/ai-prompt-transport", () => ({
  sendAiPrompt: aiPromptTransportApi.sendAiPrompt,
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
let latestPaneHeaderActionClusterProps: Record<string, unknown> | null = null;

vi.mock("./BlockWorkspaceSurface", () => ({
  BlockWorkspaceSurface: (props: Record<string, unknown>) => {
    latestBlockWorkspaceProps = props;
    return <div data-testid="block-workspace-surface" />;
  },
}));

vi.mock("./PaneHeaderActionCluster", () => ({
  PaneHeaderActionCluster: (props: Record<string, unknown>) => {
    latestPaneHeaderActionClusterProps = props;
    return <div data-testid="pane-header-actions" />;
  },
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
    latestPaneHeaderActionClusterProps = null;
    terminalApi.submitTerminalAgentPrompt.mockClear();
    terminalApi.listCodexSessions.mockReset();
    terminalApi.resetTerminalAgentSession.mockClear();
    terminalApi.attachTerminalAgentSession.mockClear();
    terminalApi.setTerminalAgentModel.mockClear();
    terminalApi.runTerminalAgentReview.mockClear();
    aiPromptTransportApi.sendAiPrompt.mockClear();

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

  it("attaches a qwen session directly from /resume <session-id> without invoking the codex session picker", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "qwen",
            mode: "structured",
            state: "ready",
            fallbackReason: null,
          },
        },
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/resume qwen-session-1");
    });

    expect(terminalApi.listCodexSessions).not.toHaveBeenCalled();
    expect(terminalApi.attachTerminalAgentSession).toHaveBeenCalledWith("session-1", "qwen-session-1");
    const tabState = useTerminalViewStore.getState().tabStates["tab:1"];
    const entries = tabState.aiTranscript?.entries ?? [];
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry).toMatchObject({
      kind: "system",
      text: expect.stringContaining("qwen-session-1"),
    });
  });

  it("rejects qwen /review in the structured composer instead of silently running codex review", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "qwen",
            mode: "structured",
            state: "ready",
            fallbackReason: null,
          },
        },
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/review");
    });

    expect(terminalApi.runTerminalAgentReview).not.toHaveBeenCalled();
    const tabState = useTerminalViewStore.getState().tabStates["tab:1"];
    const entries = tabState.aiTranscript?.entries ?? [];
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry).toMatchObject({
      kind: "system",
      tone: "warning",
    });
    expect(lastEntry?.text).toContain("/review");
    expect(lastEntry?.text).toContain("Expert Drawer");
  });

  it("routes qwen raw-fallback composer input directly to terminal transport instead of structured slash handling", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "qwen",
            mode: "raw-fallback",
            state: "fallback",
            fallbackReason: "structured bridge unavailable for the current command",
          },
        },
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/model qwen-plus");
    });

    expect(aiPromptTransportApi.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: "tab:1",
        prompt: "/model qwen-plus",
        submitStructuredPrompt: undefined,
      }),
    );
    expect(terminalApi.setTerminalAgentModel).not.toHaveBeenCalled();
  });

  it("renders the AI MODE badge immediately before the quick prompt trigger when the runtime supports it", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "codex",
            mode: "raw-fallback",
            state: "fallback",
            fallbackReason: null,
            capabilities: {
              supportsResumePicker: true,
              supportsDirectResume: false,
              supportsReview: true,
              supportsModelOverride: true,
              showsBypassCapsule: true,
            },
          },
        },
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    const header = host.querySelector(".terminal-pane__header");
    const trigger = host.querySelector('[aria-label="Open quick AI prompt"]');
    const mode = host.querySelector('[aria-label="AI workflow mode"]');

    expect(header).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(mode).not.toBeNull();
    const isModeBeforeTrigger = Boolean(
      mode && trigger && (mode.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    expect(isModeBeforeTrigger).toBe(true);
  });

  it("increments the quick prompt request key when the header trigger is clicked", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "codex",
            mode: "raw-fallback",
            state: "fallback",
            fallbackReason: null,
            capabilities: {
              supportsResumePicker: true,
              supportsDirectResume: false,
              supportsReview: true,
              supportsModelOverride: true,
              showsBypassCapsule: true,
            },
          },
        },
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(latestBlockWorkspaceProps?.quickPromptOpenRequestKey).toBe(0);

    await act(async () => {
      host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(latestBlockWorkspaceProps?.quickPromptOpenRequestKey).toBe(1);
  });

  it("offers a header focus button and toggles focus mode through the pane header callback", async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      window: {
        ...state.window!,
        layout: {
          kind: "container",
          id: "root",
          axis: "horizontal",
          children: [
            { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
            { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
          ],
          sizes: [1, 1],
        },
        tabs: {
          ...state.window!.tabs,
          "tab:2": {
            tabId: "tab:2",
            title: "Tab 2",
            shell: "/bin/bash",
            cwd: "/workspace",
            status: "running",
            sessionId: "session-2",
          },
        },
        activeTabId: "tab:1",
        nextTabNumber: 3,
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(latestPaneHeaderActionClusterProps?.menuActions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "focus-pane" })]),
    );
    expect(latestPaneHeaderActionClusterProps?.isFocusedPane).toBe(false);

    await act(async () => {
      (latestPaneHeaderActionClusterProps?.onToggleFocus as () => void)();
    });

    expect(useWorkspaceStore.getState().focusMode?.focusedTabId).toBe("tab:1");
    expect(useWorkspaceStore.getState().window?.layout).toEqual({
      kind: "pane",
      id: "pane:tab:1",
      paneId: "tab:1",
    });
  });

  it("disables split and close controls and shows focused chrome while focus mode is active", async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      focusMode: {
        focusedTabId: "tab:1",
        layoutBeforeFocus: {
          kind: "container",
          id: "root",
          axis: "horizontal",
          children: [
            { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
            { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
          ],
          sizes: [1, 1],
        },
        activeTabIdBeforeFocus: "tab:1",
      },
    }));

    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(latestPaneHeaderActionClusterProps?.canSplitRight).toBe(false);
    expect(latestPaneHeaderActionClusterProps?.canSplitDown).toBe(false);
    expect(latestPaneHeaderActionClusterProps?.canClose).toBe(false);
    expect(host.textContent).toContain("FOCUSED");
  });
});
