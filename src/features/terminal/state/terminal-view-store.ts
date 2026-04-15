import { create } from "zustand";

import {
  appendLiveConsoleOutput,
  applyTerminalSemanticEvent,
  appendDialogOutput,
  applyPreferredMode,
  applyShellLifecycleEvent,
  createDialogState,
  isDialogShellSupported,
  submitDialogCommand,
  type DialogState,
  type PaneRenderMode,
  type PaneRenderModeSource,
} from "../../../domain/terminal/dialog";
import type { TerminalAgentEvent, TerminalSemanticEvent } from "../../../domain/terminal/types";
import { normalizeDialogOutput } from "../lib/dialog-output";
import {
  consumeShellIntegrationChunk,
  createShellIntegrationParserState,
  type ShellIntegrationParserState,
} from "../lib/shell-integration";
import {
  appendAiTranscriptOutput,
  appendAiTranscriptPrompt,
  appendAiTranscriptSystem,
  clearAiTranscript,
  completeAiTranscriptOutput,
  createAiTranscriptState,
  type AiTranscriptState,
} from "../lib/ai-transcript";

interface TerminalViewStore {
  tabStates: Record<string, TerminalTabViewState>;
  resetTabBuffer: (tabId: string) => void;
  removeTabBuffer: (tabId: string) => void;
  syncTabState: (tabId: string, shell: string, cwd: string, preferredMode: PaneRenderMode) => void;
  submitCommand: (tabId: string, command: string) => void;
  recordAiPrompt: (tabId: string, prompt: string) => void;
  recordAiSystemMessage: (
    tabId: string,
    message: string,
    tone?: "info" | "warning" | "error",
  ) => void;
  clearAiTranscript: (tabId: string) => void;
  consumeOutput: (tabId: string, data: string) => void;
  consumeSemantic: (tabId: string, event: TerminalSemanticEvent) => void;
  consumeAgentEvent: (tabId: string, event: TerminalAgentEvent) => void;
  setTabMode: (tabId: string, mode: PaneRenderMode, source: PaneRenderModeSource) => void;
  resetTabState: (tabId: string, shell: string, cwd: string, preferredMode: PaneRenderMode) => void;
  removeTabState: (tabId: string) => void;
}

export interface TerminalTabViewState extends DialogState {
  shell: string;
  parserState: ShellIntegrationParserState;
  aiTranscript?: AiTranscriptState;
  agentBridge?: AgentBridgeState | null;
}

export interface AgentBridgeState {
  provider: string;
  mode: "structured" | "raw-fallback";
  state: "connecting" | "ready" | "running" | "fallback";
  fallbackReason: string | null;
}

export const useTerminalViewStore = create<TerminalViewStore>((set) => ({
  tabStates: {},

  syncTabState: (tabId, shell, cwd, preferredMode) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const existing = state.tabStates[key];
      if (!existing) {
        return {
          tabStates: {
            ...state.tabStates,
            [key]: createTabViewState(shell, cwd, preferredMode),
          },
        };
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...existing,
            ...reconcileShellState(existing, shell, cwd, preferredMode),
            shell,
          },
        },
      };
    }),

  submitCommand: (tabId, command) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState || tabState.shellIntegration === "unsupported") {
        return state;
      }

      const nextTabState = {
        ...tabState,
        ...submitDialogCommand(tabState, command, () => crypto.randomUUID()),
      };

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextTabState,
        },
      };
    }),

  recordAiPrompt: (tabId, prompt) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState || tabState.presentation !== "agent-workflow") {
        return state;
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...tabState,
            aiTranscript: appendAiTranscriptPrompt(tabState.aiTranscript ?? createAiTranscriptState(), prompt, () =>
              crypto.randomUUID(),
            ),
          },
        },
      };
    }),

  recordAiSystemMessage: (tabId, message, tone = "info") =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState || tabState.presentation !== "agent-workflow") {
        return state;
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...tabState,
            aiTranscript: appendAiTranscriptSystem(
              tabState.aiTranscript ?? createAiTranscriptState(),
              message,
              () => crypto.randomUUID(),
              tone,
            ),
          },
        },
      };
    }),

  clearAiTranscript: (tabId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState || tabState.presentation !== "agent-workflow") {
        return state;
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...tabState,
            aiTranscript: clearAiTranscript(),
          },
        },
      };
    }),

  consumeOutput: (tabId, data) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState) {
        return state;
      }

      const parsed = consumeShellIntegrationChunk(tabState.parserState, data);
      let nextState: TerminalTabViewState = {
        ...tabState,
        parserState: parsed.state,
      };

      const normalizedOutput = normalizeDialogOutput(parsed.visibleOutput);
      const shouldCaptureVisibleOutput =
        nextState.dialogPhase !== "live-console" &&
        nextState.captureActiveOutputInTranscript &&
        nextState.presentation !== "agent-workflow";

      const shouldCaptureLiveConsoleOutput =
        nextState.dialogPhase === "live-console" &&
        nextState.presentation !== "agent-workflow" &&
        normalizedOutput.length > 0;

      if (shouldCaptureLiveConsoleOutput) {
        nextState = {
          ...nextState,
          ...appendLiveConsoleOutput(nextState, normalizedOutput),
        };
      }

      if (normalizedOutput.length > 0 && shouldCaptureVisibleOutput) {
        nextState = {
          ...nextState,
          ...appendDialogOutput(nextState, normalizedOutput),
        };
      }

      for (const event of parsed.events) {
        nextState = {
          ...nextState,
          ...applyShellLifecycleEvent(nextState, event),
        };

        if (
          event.type === "command-end" &&
          nextState.presentation !== "agent-workflow" &&
          (nextState.aiTranscript?.entries.length ?? 0) > 0
        ) {
          nextState = {
            ...nextState,
            aiTranscript: completeAiTranscriptOutput(nextState.aiTranscript ?? createAiTranscriptState()),
          };
        }
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextState,
        },
      };
    }),

  consumeSemantic: (tabId, event) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState) {
        return state;
      }

      let nextState: TerminalTabViewState = {
        ...tabState,
        ...applyTerminalSemanticEvent(tabState, event),
      };

      if (event.kind === "agent-workflow" && !nextState.agentBridge) {
        const provider = resolveAgentProvider(event.commandEntry);
        if (provider) {
          nextState = {
            ...nextState,
            agentBridge: {
              provider,
              mode: "structured",
              state: "connecting",
              fallbackReason: null,
            },
          };
        }
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextState,
        },
      };
    }),

  consumeAgentEvent: (tabId, event) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState) {
        return state;
      }

      let nextState: TerminalTabViewState = tabState;

      switch (event.type) {
        case "bridge-state":
          nextState = {
            ...nextState,
            agentBridge: {
              provider: event.provider,
              mode: event.mode,
              state: event.state,
              fallbackReason: event.fallbackReason ?? null,
            },
          };
          break;
        case "assistant-message":
          nextState = {
            ...nextState,
            aiTranscript: appendAiTranscriptOutput(
              nextState.aiTranscript ?? createAiTranscriptState(),
              event.text,
              () => crypto.randomUUID(),
            ),
            agentBridge: {
              provider: event.provider,
              mode: nextState.agentBridge?.mode ?? "structured",
              state: "running",
              fallbackReason: null,
            },
          };
          break;
        case "error":
          nextState = {
            ...nextState,
            aiTranscript: completeAiTranscriptOutput(
              appendAiTranscriptOutput(
                nextState.aiTranscript ?? createAiTranscriptState(),
                event.message,
                () => crypto.randomUUID(),
              ),
            ),
            agentBridge: {
              provider: event.provider,
              mode: nextState.agentBridge?.mode ?? "structured",
              state: "ready",
              fallbackReason: null,
            },
          };
          break;
        case "turn-complete":
          nextState = {
            ...nextState,
            aiTranscript: completeAiTranscriptOutput(nextState.aiTranscript ?? createAiTranscriptState()),
            agentBridge: nextState.agentBridge
              ? {
                  ...nextState.agentBridge,
                  provider: event.provider,
                  state: nextState.agentBridge.mode === "raw-fallback" ? "fallback" : "ready",
                }
              : nextState.agentBridge,
          };
          break;
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextState,
        },
      };
    }),

  setTabMode: (tabId, mode, source) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const tabState = state.tabStates[key];
      if (!tabState) {
        return state;
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...tabState,
            mode,
            modeSource: source,
          },
        },
      };
    }),

  resetTabState: (tabId, shell, cwd, preferredMode) =>
    set((state) => ({
      tabStates: {
        ...state.tabStates,
        [getTerminalBufferKey(tabId)]: createTabViewState(shell, cwd, preferredMode),
      },
    })),

  removeTabState: (tabId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      if (!state.tabStates[key]) {
        return state;
      }

      const tabStates = { ...state.tabStates };
      delete tabStates[key];
      return { tabStates };
    }),

  resetTabBuffer: () => {},

  removeTabBuffer: () => {},
}));

export function getTerminalBufferKey(tabId: string): string {
  return tabId;
}

export function selectTerminalTabState(
  tabStates: Record<string, TerminalTabViewState>,
  tabId: string,
): TerminalTabViewState | null {
  return tabStates[getTerminalBufferKey(tabId)] ?? null;
}

function createTabViewState(shell: string, cwd: string, preferredMode: PaneRenderMode): TerminalTabViewState {
  return {
    ...createDialogState(shell, cwd, preferredMode),
    shell,
    parserState: createShellIntegrationParserState(),
    aiTranscript: createAiTranscriptState(),
    agentBridge: null,
  };
}

function reconcileShellState(
  state: TerminalTabViewState,
  shell: string,
  cwd: string,
  preferredMode: PaneRenderMode,
): Partial<TerminalTabViewState> {
  const supported = isDialogShellSupported(shell);
  if (!supported) {
    return {
      preferredMode,
      shellIntegration: "unsupported",
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
      composerMode: "command",
      cwd,
      captureActiveOutputInTranscript: true,
    };
  }

  const nextState = applyPreferredMode(
    {
      ...state,
      shellIntegration: "supported",
      cwd,
    },
    preferredMode,
  );

  return {
    preferredMode: nextState.preferredMode,
    shellIntegration: nextState.shellIntegration,
    mode: nextState.mode,
    modeSource: nextState.modeSource,
    presentation: nextState.presentation,
    cwd: nextState.cwd,
    blocks: nextState.blocks,
    activeCommandBlockId: nextState.activeCommandBlockId,
    composerMode: nextState.composerMode,
    captureActiveOutputInTranscript: nextState.captureActiveOutputInTranscript,
    composerHistory: nextState.composerHistory,
    aiTranscript: state.aiTranscript,
    agentBridge: state.agentBridge,
  };
}

function resolveAgentProvider(commandEntry: string | undefined): string | null {
  const normalized = commandEntry?.trim();
  if (!normalized) {
    return null;
  }

  const tokens = normalized.split(/\s+/u);
  const command = tokens.find((token) => !token.includes("=") && token !== "env" && token !== "command" && token !== "exec");
  if (!command) {
    return null;
  }

  if (command === "codex") {
    return "codex";
  }

  if (command === "claude" || command === "claude-code") {
    return "claude";
  }

  if (command === "qwen" || command === "qwen-code") {
    return "qwen";
  }

  return null;
}
