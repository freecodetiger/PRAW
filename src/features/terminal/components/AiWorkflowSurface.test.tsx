// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { AiWorkflowSurface } from "./AiWorkflowSurface";

const renderCalls: Array<{ inputSuspended?: boolean }> = [];

vi.mock("./ClassicTerminalSurface", () => ({
  ClassicTerminalSurface: (props: { inputSuspended?: boolean }) => {
    renderCalls.push({
      inputSuspended: props.inputSuspended,
    });
    return <div data-testid="classic-terminal-surface" />;
  },
}));

function createAgentWorkflowPaneState(): TerminalTabViewState {
  return {
    ...createDialogState("/bin/bash", "/workspace"),
    mode: "classic" as const,
    modeSource: "auto-interactive" as const,
    presentation: "agent-workflow" as const,
    shell: "/bin/bash",
    parserState: createShellIntegrationParserState(),
    agentBridge: {
      provider: "codex" as const,
      mode: "structured" as const,
      state: "ready" as const,
      fallbackReason: null,
    },
    aiTranscript: {
      entries: [
        {
          id: "prompt:1",
          kind: "prompt" as const,
          text: "Summarize the latest diff",
        },
        {
          id: "output:1",
          kind: "output" as const,
          text: "Here is the current state.",
          status: "streaming" as const,
        },
      ],
    },
  };
}

function createRawFallbackPaneState(): TerminalTabViewState {
  return {
    ...createAgentWorkflowPaneState(),
    agentBridge: {
      provider: "qwen" as const,
      mode: "raw-fallback" as const,
      state: "fallback" as const,
      fallbackReason: "structured bridge unavailable for the current command",
    },
    aiTranscript: {
      entries: [],
    },
  };
}

function renderSurface(
  root: Root,
  paneState = createAgentWorkflowPaneState(),
  props: Partial<ComponentProps<typeof AiWorkflowSurface>> = {},
) {
  act(() => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={paneState}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={async () => undefined}
        {...props}
      />,
    );
  });
}

describe("AiWorkflowSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    renderCalls.length = 0;
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {},
    }));
    useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders one active raw terminal surface for structured AI mode and removes the structured transcript chrome", () => {
    renderSurface(root);

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
    expect(host.querySelector(".ai-workflow__transcript")).toBeNull();
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
    expect(host.textContent).not.toContain("Open Expert Drawer");
    expect(host.textContent).not.toContain("workspace chat");
  });

  it("keeps raw-fallback AI mode on the same raw terminal surface without reviving structured UI", () => {
    renderSurface(root, createRawFallbackPaneState());

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
    expect(host.querySelector(".ai-workflow__transcript")).toBeNull();
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
    expect(host.textContent).not.toContain("Open Expert Drawer");
  });

  it("opens the bypass capsule on request while keeping the raw terminal surface active", () => {
    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
  });

  it("keeps an expanded bypass capsule open when forceOpenExpertDrawerKey changes because quick prompt is independent of expert drawer", () => {
    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
      forceOpenExpertDrawerKey: 1,
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
  });

  it("submits bypass prompts with Enter and collapses the capsule after success", async () => {
    const onSubmitAiInput = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createAgentWorkflowPaneState()}
          status="running"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={onSubmitAiInput}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "continue from here");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSubmitAiInput).toHaveBeenCalledWith("continue from here");
    expect(host.querySelector('[aria-label="AI prompt dock"]')).toBeNull();
  });

  it("preserves the bypass draft and surfaces an error when submit fails", async () => {
    const onSubmitAiInput = vi.fn(async () => {
      throw new Error("bridge offline");
    });

    await act(async () => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createAgentWorkflowPaneState()}
          status="running"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={onSubmitAiInput}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "retry this prompt");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe(
      "retry this prompt",
    );
    expect(host.textContent).toContain("Could not send prompt");
  });

  it("renders the resume picker above the same raw terminal surface when recent sessions are available", () => {
    const onSelectResumeSession = vi.fn();

    renderSurface(root, createAgentWorkflowPaneState(), {
      resumePicker: {
        open: true,
        sessions: [
          {
            id: "session-a",
            cwd: "/workspace",
            timestamp: "2026-04-15T00:00:00.000Z",
            latestPrompt: "review the failing test",
          },
        ],
        onSelect: onSelectResumeSession,
        onClose: vi.fn(),
      },
    });

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.textContent).toContain("Resume Codex session");

    const sessionButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("review the failing test"),
    );
    expect(sessionButton).not.toBeUndefined();

    act(() => {
      sessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelectResumeSession).toHaveBeenCalledWith("session-a");
  });
});
