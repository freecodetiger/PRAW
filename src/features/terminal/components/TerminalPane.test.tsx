// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalPane } from "./TerminalPane";

const aiPromptTransportApi = vi.hoisted(() => ({
  sendAiPrompt: vi.fn(async () => undefined),
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

  it("forwards slash-prefixed AI input directly to raw transport without local command interception", async () => {
    await act(async () => {
      root.render(<TerminalPane tabId="tab:1" />);
    });

    expect(latestBlockWorkspaceProps).not.toBeNull();

    await act(async () => {
      await (latestBlockWorkspaceProps?.onSubmitAiInput as ((value: string) => Promise<void>))("/help");
    });

    expect(aiPromptTransportApi.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: "tab:1",
        prompt: "/help",
      }),
    );

    const tabState = useTerminalViewStore.getState().tabStates["tab:1"];
    const entries = tabState.aiTranscript?.entries ?? [];
    expect(entries.some((entry) => entry.kind === "system")).toBe(false);
  });

  it("does not attach a structured bridge submitter when structured mode prompts are sent", async () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "tab:1": {
          ...state.tabStates["tab:1"],
          agentBridge: {
            provider: "codex",
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

    expect(aiPromptTransportApi.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: "tab:1",
        prompt: "/review",
      }),
    );
    const [[structuredCallArg]] = aiPromptTransportApi.sendAiPrompt.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(structuredCallArg).not.toHaveProperty("submitStructuredPrompt");
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
      }),
    );
    const [[fallbackCallArg]] = aiPromptTransportApi.sendAiPrompt.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(fallbackCallArg).not.toHaveProperty("submitStructuredPrompt");
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
