// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
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

function createQwenWorkflowPaneState() {
  return {
    ...createAgentWorkflowPaneState(),
    agentBridge: {
      provider: "qwen" as const,
      mode: "structured" as const,
      state: "ready" as const,
      fallbackReason: null,
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

  it("keeps the main structured composer available while the capsule acts as a side input and raw terminal input stays suspended until the expert drawer opens", async () => {
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

    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(true);
    expect(host.querySelector('[aria-label="AI composer input"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();

    const composer = host.querySelector('[aria-label="AI composer input"]') as HTMLTextAreaElement | null;
    expect(composer).not.toBeNull();

    await act(async () => {
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

  it("restores transcript scroll position and jump state after the workflow surface remounts", () => {
    const paneState = createAgentWorkflowPaneState();

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
        />,
      );
    });

    const transcript = host.querySelector(".ai-workflow__transcript") as HTMLDivElement | null;
    expect(transcript).not.toBeNull();
    Object.defineProperty(transcript, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(transcript, "clientHeight", {
      configurable: true,
      value: 400,
    });
    transcript!.scrollTop = 640;

    act(() => {
      transcript?.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(host.textContent).toContain("Jump to latest");

    act(() => {
      root.render(<div />);
    });

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
        />,
      );
    });

    const remountedTranscript = host.querySelector(".ai-workflow__transcript") as HTMLDivElement | null;
    expect(remountedTranscript?.scrollTop).toBe(640);
    expect(host.textContent).toContain("Jump to latest");
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
    expect(host.textContent).toContain("Use the main composer for prompts and slash commands. The quick prompt capsule stays available as a side input.");
    expect(host.querySelector('[aria-label="AI composer input"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
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
    expect(host.textContent).not.toContain("Native terminal mode is active");
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

  it("does not render the quick prompt trigger inside the workflow body", () => {
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

    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
    expect(host.querySelector('[aria-label="AI prompt input"]')).toBeNull();
  });

  it("opens the centered quick prompt input when the header request key changes", () => {
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
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();

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
          quickPromptOpenRequestKey={2}
        />,
      );
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
  });

  it("replaces the right-side trigger with a centered input capsule and submits with Enter", async () => {
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
    expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("true");
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input?.getAttribute("placeholder")).toBe("");
    expect(host.querySelector('[aria-label="Send quick AI prompt"]')).toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "continue from here");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSubmitAiInput).toHaveBeenCalledWith("continue from here");
    expect(host.querySelector('[aria-label="AI prompt input"]')).toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
  });

  it("keeps the centered capsule open on outside click and only collapses on Escape after the draft is cleared", async () => {
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
          onSubmitAiInput={async () => undefined}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "draft survives");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("true");
    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("draft survives");

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("true");
    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("draft survives");

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
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

    expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("true");
    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("retry this prompt");
    expect(host.textContent).toContain("Could not send prompt");
  });

  it("clears draft only after successful submit", async () => {
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

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "clear after success");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
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
          quickPromptOpenRequestKey={2}
        />,
      );
    });

    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("");
  });

  it("keeps the dock visible after successful submit and only collapses back to capsule state", async () => {
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

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "submit and collapse");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
  });

  it("auto-resizes the bypass input with content while capping its height", async () => {
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
          onSubmitAiInput={async () => undefined}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    let currentScrollHeight = 92;
    Object.defineProperty(input as HTMLTextAreaElement, "scrollHeight", {
      configurable: true,
      get: () => currentScrollHeight,
    });

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "line 1\nline 2\nline 3");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect((input as HTMLTextAreaElement).style.height).toBe("92px");

    currentScrollHeight = 240;

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect((input as HTMLTextAreaElement).style.height).toBe("160px");
    expect((input as HTMLTextAreaElement).style.overflowY).toBe("auto");
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
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input?.disabled).toBe(true);
    expect(host.textContent).toContain("The AI session is not accepting input.");
  });

  it("renders qwen with the same main-composer-plus-capsule structured prompt surface as codex", () => {
    act(() => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createQwenWorkflowPaneState()}
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

    expect(host.querySelector('[aria-label="AI composer input"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
    expect(host.textContent).toContain("Qwen workspace chat");
  });

  it("suggests qwen slash commands inside the main composer from runtime capabilities", async () => {
    await act(async () => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createQwenWorkflowPaneState()}
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

    const input = host.querySelector('[aria-label="AI composer input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "/res");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(host.querySelector('[aria-label="Command suggestions"]')).not.toBeNull();
    expect(host.textContent).toContain("/resume");
    expect(host.textContent).not.toContain("/review");

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect((host.querySelector('[aria-label="AI composer input"]') as HTMLTextAreaElement | null)?.value).toBe("/resume ");
  });

  it("suggests qwen slash commands inside the capsule from runtime capabilities", async () => {
    await act(async () => {
      root.render(
        <AiWorkflowSurface
          tabId="tab:1"
          paneState={createQwenWorkflowPaneState()}
          status="running"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitAiInput={async () => undefined}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "/res");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(host.querySelector('[aria-label="Command suggestions"]')).not.toBeNull();
    expect(host.textContent).toContain("/resume");
    expect(host.textContent).not.toContain("/review");

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("/resume ");
  });
});
