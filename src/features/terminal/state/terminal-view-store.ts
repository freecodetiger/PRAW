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
import { consumeShellIntegrationChunk, createShellIntegrationParserState, type ShellIntegrationParserState } from "../lib/shell-integration";

interface TerminalViewStore {
  buffers: Record<string, TerminalBufferSnapshot>;
  paneStates: Record<string, TerminalPaneViewState>;
  appendOutput: (tabId: string, paneId: string, data: string) => void;
  resetPaneBuffer: (tabId: string, paneId: string) => void;
  removePaneBuffer: (tabId: string, paneId: string) => void;
  syncPaneState: (tabId: string, paneId: string, shell: string, cwd: string) => void;
  submitCommand: (tabId: string, paneId: string, command: string) => void;
  consumeOutput: (tabId: string, paneId: string, data: string) => void;
  setPaneMode: (tabId: string, paneId: string, mode: PaneRenderMode, source: PaneRenderModeSource) => void;
  resetPaneState: (tabId: string, paneId: string, shell: string, cwd: string) => void;
  removePaneState: (tabId: string, paneId: string) => void;
}

export interface TerminalPaneViewState extends DialogState {
  shell: string;
  parserState: ShellIntegrationParserState;
}

export const useTerminalViewStore = create<TerminalViewStore>((set) => ({
  buffers: {},
  paneStates: {},

  appendOutput: (tabId, paneId, data) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      return {
        buffers: {
          ...state.buffers,
          [key]: appendTerminalBuffer(state.buffers[key] ?? EMPTY_TERMINAL_BUFFER, data),
        },
      };
    }),

  syncPaneState: (tabId, paneId, shell, cwd) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      const existing = state.paneStates[key];
      if (!existing) {
        return {
          paneStates: {
            ...state.paneStates,
            [key]: createPaneViewState(shell, cwd),
          },
        };
      }

      return {
        paneStates: {
          ...state.paneStates,
          [key]: {
            ...existing,
            ...reconcileShellState(existing, shell, cwd),
            shell,
          },
        },
      };
    }),

  submitCommand: (tabId, paneId, command) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      const paneState = state.paneStates[key];
      if (!paneState || paneState.shellIntegration === "unsupported") {
        return state;
      }

      return {
        paneStates: {
          ...state.paneStates,
          [key]: {
            ...paneState,
            ...submitDialogCommand(paneState, command, () => crypto.randomUUID()),
          },
        },
      };
    }),

  consumeOutput: (tabId, paneId, data) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      const paneState = state.paneStates[key];
      if (!paneState) {
        return state;
      }

      const parsed = consumeShellIntegrationChunk(paneState.parserState, data);
      let nextState: TerminalPaneViewState = {
        ...paneState,
        parserState: parsed.state,
      };

      const normalizedOutput = stripAnsiForDialog(parsed.visibleOutput);
      const shouldCaptureVisibleOutput =
        !(paneState.mode === "classic" && paneState.modeSource === "manual" && paneState.activeCommandBlockId === null);

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
        paneStates: {
          ...state.paneStates,
          [key]: nextState,
        },
      };
    }),

  setPaneMode: (tabId, paneId, mode, source) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      const paneState = state.paneStates[key];
      if (!paneState) {
        return state;
      }

      return {
        paneStates: {
          ...state.paneStates,
          [key]: {
            ...paneState,
            mode,
            modeSource: source,
          },
        },
      };
    }),

  resetPaneState: (tabId, paneId, shell, cwd) =>
    set((state) => ({
      paneStates: {
        ...state.paneStates,
        [getTerminalBufferKey(tabId, paneId)]: createPaneViewState(shell, cwd),
      },
    })),

  removePaneState: (tabId, paneId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      if (!state.paneStates[key]) {
        return state;
      }

      const paneStates = { ...state.paneStates };
      delete paneStates[key];
      return { paneStates };
    }),

  resetPaneBuffer: (tabId, paneId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      return {
        buffers: {
          ...state.buffers,
          [key]: resetTerminalBuffer(state.buffers[key] ?? EMPTY_TERMINAL_BUFFER),
        },
      };
    }),

  removePaneBuffer: (tabId, paneId) =>
    set((state) => {
      const key = getTerminalBufferKey(tabId, paneId);
      if (!state.buffers[key]) {
        return state;
      }

      const buffers = { ...state.buffers };
      delete buffers[key];
      return { buffers };
    }),
}));

export function getTerminalBufferKey(tabId: string, paneId: string): string {
  return `${tabId}:${paneId}`;
}

export function selectTerminalBuffer(
  buffers: Record<string, TerminalBufferSnapshot>,
  tabId: string,
  paneId: string,
): TerminalBufferSnapshot {
  return buffers[getTerminalBufferKey(tabId, paneId)] ?? EMPTY_TERMINAL_BUFFER;
}

export function selectTerminalPaneState(
  paneStates: Record<string, TerminalPaneViewState>,
  tabId: string,
  paneId: string,
): TerminalPaneViewState | null {
  return paneStates[getTerminalBufferKey(tabId, paneId)] ?? null;
}

function createPaneViewState(shell: string, cwd: string): TerminalPaneViewState {
  return {
    ...createDialogState(shell, cwd),
    shell,
    parserState: createShellIntegrationParserState(),
  };
}

function reconcileShellState(state: TerminalPaneViewState, shell: string, cwd: string): Partial<TerminalPaneViewState> {
  const supported = isDialogShellSupported(shell);
  if (!supported) {
    return {
      shellIntegration: "unsupported",
      mode: "classic",
      modeSource: "shell-unsupported",
      cwd,
    };
  }

  if (state.shellIntegration === "unsupported") {
    const next = createPaneViewState(shell, cwd);
    return {
      ...next,
      shell,
    };
  }

  return {
    shellIntegration: "supported",
    cwd,
  };
}

function stripAnsiForDialog(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-_]/g, "");
}
