import { create } from "zustand";

import {
  appendTerminalBuffer,
  EMPTY_TERMINAL_BUFFER,
  resetTerminalBuffer,
  type TerminalBufferSnapshot,
} from "../../../domain/terminal/buffer";
import {
  appendLiveConsoleOutput,
  appendDialogOutput,
  applyPreferredMode,
  applyShellLifecycleEvent,
  createDialogState,
  isDialogShellSupported,
  isAgentWorkflowCommand,
  requireClassicTerminal,
  submitDialogCommand,
  type DialogState,
  type PaneRenderMode,
  type PaneRenderModeSource,
} from "../../../domain/terminal/dialog";
import { normalizeDialogOutput } from "../lib/dialog-output";
import {
  consumeShellIntegrationChunk,
  createShellIntegrationParserState,
  type ShellIntegrationParserState,
} from "../lib/shell-integration";

interface TerminalViewStore {
  buffers: Record<string, TerminalBufferSnapshot>;
  tabStates: Record<string, TerminalTabViewState>;
  appendOutput: (tabId: string, data: string) => void;
  resetTabBuffer: (tabId: string) => void;
  removeTabBuffer: (tabId: string) => void;
  syncTabState: (tabId: string, shell: string, cwd: string, preferredMode: PaneRenderMode) => void;
  submitCommand: (tabId: string, command: string) => void;
  consumeOutput: (tabId: string, data: string) => void;
  setTabMode: (tabId: string, mode: PaneRenderMode, source: PaneRenderModeSource) => void;
  resetTabState: (tabId: string, shell: string, cwd: string, preferredMode: PaneRenderMode) => void;
  removeTabState: (tabId: string) => void;
}

export interface TerminalTabViewState extends DialogState {
  shell: string;
  parserState: ShellIntegrationParserState;
}

export const useTerminalViewStore = create<TerminalViewStore>((set) => ({
  buffers: {},
  tabStates: {},

  appendOutput: (tabId, data) =>
    set((state) => ({
      buffers: {
        ...state.buffers,
        [getTerminalBufferKey(tabId)]: appendTerminalBuffer(state.buffers[getTerminalBufferKey(tabId)] ?? EMPTY_TERMINAL_BUFFER, data),
      },
    })),

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
      const nextBuffers =
        nextTabState.activeCommandBlockId === null
          ? state.buffers
          : {
              ...state.buffers,
              [key]: resetTerminalBuffer(state.buffers[key] ?? EMPTY_TERMINAL_BUFFER),
            };

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextTabState,
        },
        buffers: nextBuffers,
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

      if (parsed.requiresClassic) {
        nextState = {
          ...nextState,
          ...requireClassicTerminal(nextState),
        };
      }

      const normalizedOutput = normalizeDialogOutput(parsed.visibleOutput);
      const entersAgentWorkflow = parsed.events.some(
        (event) => event.type === "command-start" && typeof event.entry === "string" && isAgentWorkflowCommand(event.entry),
      );
      const shouldCaptureVisibleOutput =
        !entersAgentWorkflow &&
        !parsed.requiresClassic &&
        nextState.dialogPhase !== "live-console" &&
        nextState.captureActiveOutputInTranscript &&
        tabState.presentation !== "agent-workflow" &&
        !(tabState.mode === "classic" && tabState.activeCommandBlockId === null);

      const shouldCaptureLiveConsoleOutput =
        !entersAgentWorkflow &&
        !parsed.requiresClassic &&
        nextState.dialogPhase === "live-console" &&
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
      }

      const nextBuffers = entersAgentWorkflow
        ? {
            ...state.buffers,
            [key]: resetTerminalBuffer(state.buffers[key] ?? EMPTY_TERMINAL_BUFFER),
          }
        : state.buffers;

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextState,
        },
        buffers: nextBuffers,
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

  resetTabBuffer: (tabId) =>
    set((state) => ({
      buffers: {
        ...state.buffers,
        [getTerminalBufferKey(tabId)]: resetTerminalBuffer(state.buffers[getTerminalBufferKey(tabId)] ?? EMPTY_TERMINAL_BUFFER),
      },
    })),

  removeTabBuffer: (tabId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      if (!state.buffers[key]) {
        return state;
      }

      const buffers = { ...state.buffers };
      delete buffers[key];
      return { buffers };
    }),
}));

export function getTerminalBufferKey(tabId: string): string {
  return tabId;
}

export function selectTerminalBuffer(
  buffers: Record<string, TerminalBufferSnapshot>,
  tabId: string,
): TerminalBufferSnapshot {
  return buffers[getTerminalBufferKey(tabId)] ?? EMPTY_TERMINAL_BUFFER;
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
  };
}
