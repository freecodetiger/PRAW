import { create } from "zustand";

import {
  appendTerminalBuffer,
  EMPTY_TERMINAL_BUFFER,
  resetTerminalBuffer,
  type TerminalBufferSnapshot,
} from "../../../domain/terminal/buffer";
import {
  appendDialogOutput,
  applyShellLifecycleEvent,
  createDialogState,
  isDialogShellSupported,
  submitDialogCommand,
  type DialogState,
  type PaneRenderMode,
  type PaneRenderModeSource,
} from "../../../domain/terminal/dialog";
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
  syncTabState: (tabId: string, shell: string, cwd: string) => void;
  submitCommand: (tabId: string, command: string) => void;
  consumeOutput: (tabId: string, data: string) => void;
  setTabMode: (tabId: string, mode: PaneRenderMode, source: PaneRenderModeSource) => void;
  resetTabState: (tabId: string, shell: string, cwd: string) => void;
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

  syncTabState: (tabId, shell, cwd) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId);
      const existing = state.tabStates[key];
      if (!existing) {
        return {
          tabStates: {
            ...state.tabStates,
            [key]: createTabViewState(shell, cwd),
          },
        };
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...existing,
            ...reconcileShellState(existing, shell, cwd),
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

      return {
        tabStates: {
          ...state.tabStates,
          [key]: {
            ...tabState,
            ...submitDialogCommand(tabState, command, () => crypto.randomUUID()),
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

      const normalizedOutput = stripAnsiForDialog(parsed.visibleOutput);
      const shouldCaptureVisibleOutput =
        tabState.presentation !== "agent-workflow" &&
        !(tabState.mode === "classic" && tabState.modeSource === "manual" && tabState.activeCommandBlockId === null);

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

  resetTabState: (tabId, shell, cwd) =>
    set((state) => ({
      tabStates: {
        ...state.tabStates,
        [getTerminalBufferKey(tabId)]: createTabViewState(shell, cwd),
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

function createTabViewState(shell: string, cwd: string): TerminalTabViewState {
  return {
    ...createDialogState(shell, cwd),
    shell,
    parserState: createShellIntegrationParserState(),
  };
}

function reconcileShellState(state: TerminalTabViewState, shell: string, cwd: string): Partial<TerminalTabViewState> {
  const supported = isDialogShellSupported(shell);
  if (!supported) {
    return {
      shellIntegration: "unsupported",
      mode: "classic",
      modeSource: "shell-unsupported",
      cwd,
    };
  }

  return {
    shellIntegration: "supported",
    cwd,
    mode:
      state.modeSource === "shell-unsupported"
        ? "dialog"
        : state.mode,
    modeSource:
      state.modeSource === "shell-unsupported"
        ? "default"
        : state.modeSource,
  };
}

function stripAnsiForDialog(data: string): string {
  return data.replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*\u0007)/g, "");
}
