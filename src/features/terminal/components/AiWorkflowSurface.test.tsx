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

const terminalRegistryApi = vi.hoisted(() => ({
  getTerminal: vi.fn(),
}));

const tauriWindowApi = vi.hoisted(() => {
  let dragDropHandler: ((event: { payload: unknown }) => void) | null = null;

  return {
    getCurrentWindow: vi.fn(() => ({
      onDragDropEvent: vi.fn(async (handler: typeof dragDropHandler extends infer T ? T : never) => {
        dragDropHandler = handler as typeof dragDropHandler;
        return () => {
          if (dragDropHandler === handler) {
            dragDropHandler = null;
          }
        };
      }),
    })),
    emitDragDropEvent(payload: unknown) {
      dragDropHandler?.({ payload });
    },
    reset() {
      this.getCurrentWindow.mockClear();
      dragDropHandler = null;
    },
  };
});

const renderCalls: Array<{ inputSuspended?: boolean }> = [];

const voiceApi = vi.hoisted(() => {
  let startedHandler: ((event: { sessionId: string }) => void) | null = null;
  let statusHandler: ((event: { sessionId: string; message: string }) => void) | null = null;
  let liveHandler: ((event: { sessionId: string; text: string }) => void) | null = null;
  let completedHandler: ((event: { sessionId: string; text: string }) => void) | null = null;
  let failedHandler: ((event: { sessionId: string; message: string }) => void) | null = null;
  let programmerVocabularyStateHandler:
    | ((event: {
        programmerVocabularyId: string;
        programmerVocabularyStatus: "idle" | "creating" | "ready" | "failed";
        programmerVocabularyError: string;
      }) => void)
    | null = null;

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
    onVoiceProgrammerVocabularyState: vi.fn(
      async (handler: typeof programmerVocabularyStateHandler extends infer T ? T : never) => {
        programmerVocabularyStateHandler = handler as typeof programmerVocabularyStateHandler;
        return () => {
          programmerVocabularyStateHandler = null;
        };
      },
    ),
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
    emitProgrammerVocabularyState(payload: {
      programmerVocabularyId: string;
      programmerVocabularyStatus: "idle" | "creating" | "ready" | "failed";
      programmerVocabularyError: string;
    }) {
      programmerVocabularyStateHandler?.(payload);
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
      this.onVoiceProgrammerVocabularyState.mockClear();
      startedHandler = null;
      statusHandler = null;
      liveHandler = null;
      completedHandler = null;
      failedHandler = null;
      programmerVocabularyStateHandler = null;
    },
  };
});

vi.mock("../../../lib/tauri/voice", () => voiceApi);
vi.mock("../lib/terminal-registry", () => terminalRegistryApi);
vi.mock("@tauri-apps/api/window", () => tauriWindowApi);

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
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    renderCalls.length = 0;
    voiceApi.reset();
    terminalRegistryApi.getTerminal.mockReset();
    tauriWindowApi.reset();
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Linux x86_64",
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
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
    getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      left: 100,
      top: 40,
      right: 320,
      bottom: 180,
      width: 220,
      height: 140,
      x: 100,
      y: 40,
      toJSON() {
        return {};
      },
    } as DOMRect));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    getBoundingClientRectSpy.mockRestore();
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

  it("shows the dashed drop target only while files are dragged over this AI pane", async () => {
    renderSurface(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('[aria-label="AI file drop target"]')).toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "enter",
        paths: ["/tmp/demo.png"],
        position: { x: 20, y: 20 },
      });
    });

    expect(host.querySelector('[aria-label="AI file drop target"]')).toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "enter",
        paths: ["/tmp/demo.png"],
        position: { x: 240, y: 120 },
      });
    });

    expect(host.querySelector('[aria-label="AI file drop target"]')).not.toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({ type: "leave" });
    });

    expect(host.querySelector('[aria-label="AI file drop target"]')).toBeNull();
  });

  it("drops file paths into the real raw terminal buffer when the bypass input is closed", async () => {
    const pasteText = vi.fn();
    terminalRegistryApi.getTerminal.mockReturnValue({ pasteText });

    renderSurface(root);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "drop",
        paths: ["/tmp/demo.png", "/tmp/it's here.png"],
        position: { x: 240, y: 120 },
      });
    });

    expect(pasteText).toHaveBeenCalledWith("'/tmp/demo.png' '/tmp/it'\"'\"'s here.png'");
    expect(host.querySelector('[aria-label="AI prompt input"]')).toBeNull();
  });

  it("routes dropped file paths into the bypass draft when the bypass input is already open", async () => {
    const pasteText = vi.fn();
    terminalRegistryApi.getTerminal.mockReturnValue({ pasteText });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "drop",
        paths: ["/tmp/demo.png"],
        position: { x: 240, y: 120 },
      });
    });

    expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe(
      "'/tmp/demo.png'",
    );
    expect(pasteText).not.toHaveBeenCalled();
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

  it("opens bypass and starts recording when a voice bypass shortcut request arrives", async () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 1,
    });

    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(1);
  });

  it("stops recording when a second voice bypass shortcut request arrives", async () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 1,
    });

    await act(async () => {
      voiceApi.emitStarted({ sessionId: "voice-session-1" });
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 2,
    });

    expect(voiceApi.stopVoiceTranscription).toHaveBeenCalledWith("voice-session-1");
  });

  it("opens bypass but does not start recording when speech is unconfigured", () => {
    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 1,
    });

    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
    expect(voiceApi.startVoiceTranscription).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Speech input is not configured");
  });

  it("ignores repeated voice bypass shortcut requests while finalizing", async () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 1,
    });

    await act(async () => {
      voiceApi.emitStarted({ sessionId: "voice-session-1" });
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 2,
    });
    renderSurface(root, createAgentWorkflowPaneState(), {
      voiceBypassToggleRequestKey: 3,
    });

    expect(voiceApi.stopVoiceTranscription).toHaveBeenCalledTimes(1);
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
      preset: "programmer",
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
      preset: "programmer",
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

  it("requests browser microphone access before starting backend voice capture", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
    expect(voiceButton).not.toBeNull();

    await act(async () => {
      voiceButton?.click();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(1);
  });

  it("warms browser microphone access after mount on macOS so the first click can reuse it", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;

    await act(async () => {
      voiceButton?.click();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(1);
  });

  it("does not warm browser microphone access after mount on Linux and waits for an explicit voice click", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Linux x86_64",
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getUserMedia).not.toHaveBeenCalled();

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;

    await act(async () => {
      voiceButton?.click();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(1);
  });

  it("surfaces a microphone permission failure before contacting the backend voice bridge", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error("Permission denied");
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;

    await act(async () => {
      voiceButton?.click();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(voiceApi.startVoiceTranscription).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Check microphone permission and try again");
  });

  it("does not repeat browser microphone warmup after one successful permission preflight", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      apiKey: "speech-key",
      language: "auto",
    });

    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
    expect(voiceButton).not.toBeNull();

    await act(async () => {
      voiceButton?.click();
    });

    await act(async () => {
      voiceApi.emitStarted({ sessionId: "voice-session-1" });
      voiceApi.emitCompleted({ sessionId: "voice-session-1", text: "first take" });
    });

    await act(async () => {
      voiceButton?.click();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(2);
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

  it("syncs programmer vocabulary cache state from backend events into the app config store", async () => {
    renderSurface(root, createAgentWorkflowPaneState(), {
      quickPromptOpenRequestKey: 1,
    });

    await act(async () => {
      await Promise.resolve();
      voiceApi.emitProgrammerVocabularyState({
        programmerVocabularyId: "vocab-user-123",
        programmerVocabularyStatus: "ready",
        programmerVocabularyError: "",
      });
    });

    expect(useAppConfigStore.getState().config.speech.programmerVocabularyId).toBe("vocab-user-123");
    expect(useAppConfigStore.getState().config.speech.programmerVocabularyStatus).toBe("ready");
    expect(useAppConfigStore.getState().config.speech.programmerVocabularyError).toBe("");
  });

  it("does not render resume picker chrome in the raw-only AI surface", () => {
    renderSurface(root, createAgentWorkflowPaneState());

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Resume Codex session");
    expect(host.querySelector(".ai-workflow__resume-picker")).toBeNull();
  });
});
