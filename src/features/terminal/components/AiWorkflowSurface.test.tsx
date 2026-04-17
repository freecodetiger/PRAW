// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { createDialogState } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useTerminalViewStore } from "../state/terminal-view-store";
import { AiWorkflowSurface } from "./AiWorkflowSurface";

const renderCalls: Array<{ inputSuspended?: boolean }> = [];

const voiceApi = vi.hoisted(() => {
  let startedHandler: ((event: { sessionId: string }) => void) | null = null;
  let statusHandler: ((event: { sessionId: string; message: string }) => void) | null = null;
  let liveHandler: ((event: { sessionId: string; text: string }) => void) | null = null;
  let completedHandler: ((event: { sessionId: string; text: string }) => void) | null = null;
  let failedHandler: ((event: { sessionId: string; message: string }) => void) | null = null;

  return {
    startVoiceTranscription: vi.fn(async () => ({ sessionId: "voice-session-1" })),
    stopVoiceTranscription: vi.fn(async () => undefined),
    cancelVoiceTranscription: vi.fn(async () => undefined),
    onVoiceTranscriptionStarted: vi.fn(async (handler: typeof startedHandler extends infer T ? T : never) => {
      startedHandler = handler as typeof startedHandler;
      return () => {
        startedHandler = null;
      };
    }),
    onVoiceTranscriptionStatus: vi.fn(async (handler: typeof statusHandler extends infer T ? T : never) => {
      statusHandler = handler as typeof statusHandler;
      return () => {
        statusHandler = null;
      };
    }),
    onVoiceTranscriptionLive: vi.fn(async (handler: typeof liveHandler extends infer T ? T : never) => {
      liveHandler = handler as typeof liveHandler;
      return () => {
        liveHandler = null;
      };
    }),
    onVoiceTranscriptionCompleted: vi.fn(async (handler: typeof completedHandler extends infer T ? T : never) => {
      completedHandler = handler as typeof completedHandler;
      return () => {
        completedHandler = null;
      };
    }),
    onVoiceTranscriptionFailed: vi.fn(async (handler: typeof failedHandler extends infer T ? T : never) => {
      failedHandler = handler as typeof failedHandler;
      return () => {
        failedHandler = null;
      };
    }),
    emitStarted(payload: { sessionId: string }) {
      startedHandler?.(payload);
    },
    emitStatus(payload: { sessionId: string; message: string }) {
      statusHandler?.(payload);
    },
    emitLive(payload: { sessionId: string; text: string }) {
      liveHandler?.(payload);
    },
    emitCompleted(payload: { sessionId: string; text: string }) {
      completedHandler?.(payload);
    },
    emitFailed(payload: { sessionId: string; message: string }) {
      failedHandler?.(payload);
    },
    reset() {
      this.startVoiceTranscription.mockClear();
      this.stopVoiceTranscription.mockClear();
      this.cancelVoiceTranscription.mockClear();
      this.onVoiceTranscriptionStarted.mockClear();
      this.onVoiceTranscriptionStatus.mockClear();
      this.onVoiceTranscriptionLive.mockClear();
      this.onVoiceTranscriptionCompleted.mockClear();
      this.onVoiceTranscriptionFailed.mockClear();
      startedHandler = null;
      statusHandler = null;
      liveHandler = null;
      completedHandler = null;
      failedHandler = null;
    },
  };
});

vi.mock("../../../lib/tauri/voice", () => voiceApi);

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
    aiSession: {
      provider: "codex" as const,
      rawOnly: true,
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
    aiSession: {
      provider: "qwen" as const,
      rawOnly: true,
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
    voiceApi.reset();
    useAppConfigStore.setState({
      config: DEFAULT_APP_CONFIG,
      hydrateConfig: useAppConfigStore.getState().hydrateConfig,
      patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
      patchAiConfig: useAppConfigStore.getState().patchAiConfig,
      patchSpeechConfig: useAppConfigStore.getState().patchSpeechConfig,
      patchUiConfig: useAppConfigStore.getState().patchUiConfig,
    });
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

  it("keeps rendering the shared raw terminal even when aiTranscript still contains prior entries", () => {
    const paneState = createAgentWorkflowPaneState();
    paneState.aiTranscript = {
      entries: [
        { id: "prompt:stale", kind: "prompt", text: "stale prompt" },
        { id: "output:stale", kind: "output", text: "stale output", status: "completed" },
      ],
    };

    renderSurface(root, paneState);

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.querySelector(".ai-workflow__transcript")).toBeNull();
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
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

  it("keeps the voice button visible but disabled when speech is not configured", () => {
    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
    expect(voiceButton).not.toBeNull();
    expect(voiceButton?.disabled).toBe(true);
    expect(host.textContent).toContain("Speech input is not configured");
  });

  it("starts on first click, shows live transcript separately, and stops on second click", async () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "zh",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    expect(voiceButton).not.toBeNull();

    await act(async () => {
      voiceButton?.click();
    });

    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledWith({
      apiKey: "speech-key",
      language: "zh",
      provider: "aliyun-paraformer-realtime",
    });

    await act(async () => {
      voiceApi.emitStarted({ sessionId: "voice-session-1" });
      voiceApi.emitLive({ sessionId: "voice-session-1", text: "你好" });
    });

    expect(host.querySelector('[aria-label="Live transcript preview"]')?.textContent).toContain("你好");
    expect(input?.value).toBe("");

    await act(async () => {
      voiceButton?.click();
    });

    expect(voiceApi.stopVoiceTranscription).toHaveBeenCalledWith("voice-session-1");

    await act(async () => {
      voiceApi.emitCompleted({ sessionId: "voice-session-1", text: "你好 codex" });
    });

    expect(input?.value).toBe("你好 codex");
  });

  it("cancels active recording on escape and preserves any existing typed draft", async () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
    expect(input).not.toBeNull();
    expect(voiceButton).not.toBeNull();

    await act(async () => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "existing draft");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      voiceButton?.click();
    });

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(voiceApi.cancelVoiceTranscription).toHaveBeenCalledWith("voice-session-1");
    expect(input?.value).toBe("existing draft");
  });

  it("does not render resume picker chrome in the raw-only AI surface", () => {
    renderSurface(root, createAgentWorkflowPaneState());

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Resume Codex session");
    expect(host.querySelector(".ai-workflow__resume-picker")).toBeNull();
  });
});
