// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
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

function createAgentWorkflowPaneState() {
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

function createBootstrapPaneState() {
  return {
    ...createAgentWorkflowPaneState(),
    aiTranscript: {
      entries: [],
    },
  };
}

function createRawFallbackPaneState() {
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

describe("AiWorkflowSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    renderCalls.length = 0;
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

  it("renders transcript entries in a selectable DOM transcript", () => {
    act(() => {
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
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.textContent).toContain("Summarize the latest diff");
    expect(host.textContent).toContain("Here is the current state.");
    expect(host.querySelector(".ai-workflow__transcript")).not.toBeNull();
  });

  it("renders a fixed composer and sends directly from Enter while temporarily suspending raw terminal input only when the expert drawer is open", () => {
    const onSubmitAiInput = vi.fn(async () => undefined);

    act(() => {
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
        />,
      );
    });

    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(true);

    const composer = host.querySelector('[aria-label="AI composer input"]') as HTMLTextAreaElement | null;
    expect(composer).not.toBeNull();

    act(() => {
      if (composer) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(composer, "continue from the previous step");
      }
      composer?.dispatchEvent(new Event("input", { bubbles: true }));
      composer?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSubmitAiInput).toHaveBeenCalledWith("continue from the previous step");

    const inspectorTrigger = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open Expert Drawer"),
    );
    expect(inspectorTrigger).not.toBeUndefined();

    act(() => {
      inspectorTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
  });

  it("renders a native empty state instead of the raw terminal when structured AI mode has no transcript yet", () => {
    act(() => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createBootstrapPaneState()}
          status="running"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector(".ai-workflow__transcript")).not.toBeNull();
    expect(host.textContent).toContain("Ask AI");
    expect(host.querySelector('[aria-label="AI composer input"]')).not.toBeNull();
    expect(host.textContent).toContain("Open Expert Drawer");
  });

  it("keeps the raw terminal as the primary surface only after the bridge explicitly falls back", () => {
    act(() => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createRawFallbackPaneState()}
          status="running"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.textContent).toContain("Native terminal mode is active");
    expect(host.textContent).not.toContain("structured bridge unavailable");
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
  });

  it("renders a local resume picker when Codex sessions are provided", () => {
    const onSelectResumeSession = vi.fn();

    act(() => {
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
          onSubmitAiInput={async () => undefined}
          resumePicker={{
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
          }}
        />,
      );
    });

    expect(host.textContent).toContain("Resume Codex session");
    expect(host.textContent).toContain("review the failing test");

    const sessionButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("review the failing test"),
    );
    expect(sessionButton).not.toBeUndefined();

    act(() => {
      sessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelectResumeSession).toHaveBeenCalledWith("session-a");
  });

  it("renders an always-available bypass capsule in structured AI mode", () => {
    act(() => {
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
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();
  });

  it("opens the bypass overlay from the capsule and submits with Enter", async () => {
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
        />,
      );
    });

    const capsule = host.querySelector('[aria-label="Open quick AI prompt"]');
    expect(capsule).not.toBeNull();

    await act(async () => {
      capsule?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input?.getAttribute("placeholder")).toBe("");

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "continue from here");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSubmitAiInput).toHaveBeenCalledWith("continue from here");
    expect(host.querySelector('[aria-label="AI prompt overlay"]')).toBeNull();
  });

  it("keeps the bypass overlay open on Shift+Enter and closes it on Escape", async () => {
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
        />,
      );
    });

    await act(async () => {
      host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    });

    expect(onSubmitAiInput).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="AI prompt overlay"]')).not.toBeNull();

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(host.querySelector('[aria-label="AI prompt overlay"]')).toBeNull();
  });

  it("preserves the bypass draft and shows an error when submit fails", async () => {
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
        />,
      );
    });

    await act(async () => {
      host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

    expect(host.querySelector('[aria-label="AI prompt overlay"]')).not.toBeNull();
    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("retry this prompt");
    expect(host.textContent).toContain("Could not send prompt");
  });

  it("keeps the bypass capsule visible but disables submit when the session is not running", async () => {
    const onSubmitAiInput = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createAgentWorkflowPaneState()}
          status="exited"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={onSubmitAiInput}
        />,
      );
    });

    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();

    await act(async () => {
      host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input?.disabled).toBe(true);
    expect(host.textContent).toContain("The AI session is not accepting input.");
  });
});
