import { create } from "zustand";

import {
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
import type { TerminalSemanticEvent } from "../../../domain/terminal/types";
import { normalizeDialogOutput } from "../lib/dialog-output";
import {
  consumeShellIntegrationChunk,
  createShellIntegrationParserState,
  type ShellIntegrationParserState,
} from "../lib/shell-integration";
import {
  appendAiTranscriptPrompt,
  appendAiTranscriptSystem,
  clearAiTranscript,
  completeAiTranscriptOutput,
  createAiTranscriptState,
  type AiTranscriptState,
} from "../lib/ai-transcript";
import { exportTerminalArchive, removeDirect, resetDirect } from "../lib/terminal-registry";

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
  consumeOutput: (tabId: string, data: string) => string | null;
  consumeSemantic: (tabId: string, event: TerminalSemanticEvent) => void;
  updateTranscriptViewport: (tabId: string, viewport: Partial<TranscriptViewportState>) => void;
  setTabMode: (tabId: string, mode: PaneRenderMode, source: PaneRenderModeSource) => void;
  resetTabState: (tabId: string, shell: string, cwd: string, preferredMode: PaneRenderMode) => void;
  removeTabState: (tabId: string) => void;
}

export interface TranscriptViewportState {
  scrollTop: number;
  isPinnedBottom: boolean;
}

export interface TerminalTabViewState extends DialogState {
  shell: string;
  workspaceCwd?: string;
  parserState: ShellIntegrationParserState;
  aiTranscript?: AiTranscriptState;
  aiSession?: AiSessionState | null;
  transcriptViewport?: TranscriptViewportState;
  activeArchiveBaseline?: string | null;
}

export type AiSessionProvider = "codex" | "claude" | "qwen" | "unknown";

export interface AiSessionState {
  provider: AiSessionProvider;
  rawOnly: true;
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
        activeArchiveBaseline: exportTerminalArchive(tabId) ?? "",
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

  consumeOutput: (tabId, data) => {
    let promptCwd: string | null = null;

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

      if (normalizedOutput.length > 0 && shouldCaptureVisibleOutput) {
        nextState = {
          ...nextState,
          ...appendDialogOutput(nextState, normalizedOutput),
        };
      }

      for (const event of parsed.events) {
        if (event.type === "prompt-state") {
          promptCwd = event.cwd;
        }

        const archivedOutput =
          event.type === "command-end" && nextState.presentation !== "agent-workflow"
            ? computeCommandArchiveDelta(exportTerminalArchive(tabId), nextState.activeArchiveBaseline)
            : undefined;

        nextState = {
          ...nextState,
          ...applyShellLifecycleEvent(
            nextState,
            event.type === "command-end" ? { ...event, archivedOutput } : event,
          ),
          activeArchiveBaseline: event.type === "command-end" ? null : nextState.activeArchiveBaseline,
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
    });

    return promptCwd;
  },

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

      if (event.kind === "agent-workflow") {
        nextState = {
          ...nextState,
          aiSession: {
            provider: resolveAgentProvider(event.commandEntry),
            rawOnly: true,
          },
        };
      }

      return {
        tabStates: {
          ...state.tabStates,
          [key]: nextState,
        },
      };
    }),

  updateTranscriptViewport: (tabId, viewport) =>
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
            transcriptViewport: {
              ...selectTranscriptViewportState(state.tabStates, tabId),
              ...viewport,
            },
          },
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

  resetTabBuffer: (tabId) => {
    resetDirect(tabId);
  },

  removeTabBuffer: (tabId) => {
    removeDirect(tabId);
  },
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

export function selectTranscriptViewportState(
  tabStates: Record<string, TerminalTabViewState>,
  tabId: string,
): TranscriptViewportState {
  return selectTerminalTabState(tabStates, tabId)?.transcriptViewport ?? DEFAULT_TRANSCRIPT_VIEWPORT_STATE;
}

function createTabViewState(shell: string, cwd: string, preferredMode: PaneRenderMode): TerminalTabViewState {
  return {
    ...createDialogState(shell, cwd, preferredMode),
    shell,
    workspaceCwd: cwd,
    parserState: createShellIntegrationParserState(),
    aiTranscript: createAiTranscriptState(),
    aiSession: null,
    transcriptViewport: createTranscriptViewportState(),
    activeArchiveBaseline: null,
  };
}

function reconcileShellState(
  state: TerminalTabViewState,
  shell: string,
  cwd: string,
  preferredMode: PaneRenderMode,
): Partial<TerminalTabViewState> {
  const previousWorkspaceCwd = state.workspaceCwd ?? state.cwd;
  const shouldApplyWorkspaceCwd = shell !== state.shell || cwd !== previousWorkspaceCwd;
  const reconciledCwd = shouldApplyWorkspaceCwd ? cwd : state.cwd;

  const supported = isDialogShellSupported(shell);
  if (!supported) {
    return {
      preferredMode,
      shellIntegration: "unsupported",
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
      composerMode: "command",
      cwd: reconciledCwd,
      workspaceCwd: cwd,
      captureActiveOutputInTranscript: true,
    };
  }

  const nextState = applyPreferredMode(
    {
      ...state,
      shellIntegration: "supported",
      cwd: reconciledCwd,
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
    workspaceCwd: cwd,
    blocks: nextState.blocks,
    activeCommandBlockId: nextState.activeCommandBlockId,
    composerMode: nextState.composerMode,
    captureActiveOutputInTranscript: nextState.captureActiveOutputInTranscript,
    composerHistory: nextState.composerHistory,
    aiTranscript: state.aiTranscript,
    aiSession: state.aiSession,
    transcriptViewport: state.transcriptViewport,
    activeArchiveBaseline: state.activeArchiveBaseline,
  };
}

function computeCommandArchiveDelta(archiveText: string | null, baselineText: string | null | undefined): string | undefined {
  const nextArchive = archiveText ?? "";
  if (nextArchive.length === 0) {
    return undefined;
  }

  const baseline = baselineText ?? "";
  if (baseline.length === 0) {
    return nextArchive;
  }

  if (!nextArchive.startsWith(baseline)) {
    return nextArchive;
  }

  const delta = nextArchive.slice(baseline.length);
  if (delta.startsWith("\n")) {
    return delta.slice(1) || undefined;
  }

  return delta || undefined;
}
function createTranscriptViewportState(): TranscriptViewportState {
  return {
    scrollTop: 0,
    isPinnedBottom: true,
  };
}

const DEFAULT_TRANSCRIPT_VIEWPORT_STATE: TranscriptViewportState = createTranscriptViewportState();

function resolveAgentProvider(commandEntry: string | undefined): AiSessionProvider {
  const normalized = commandEntry?.trim();
  if (!normalized) {
    return "unknown";
  }

  const tokens = normalized.split(/\s+/u).filter((token) => token.length > 0);

  for (const token of tokens) {
    if (isEnvironmentAssignmentToken(token) || isWrapperOptionToken(token)) {
      continue;
    }

    const entry = normalizeCommandEntry(token);
    if (entry.length === 0 || COMMAND_PREFIXES_TO_SKIP.has(entry)) {
      continue;
    }

    if (entry === "codex") {
      return "codex";
    }

    if (entry === "claude" || entry === "claude-code") {
      return "claude";
    }

    if (entry === "qwen" || entry === "qwen-code") {
      return "qwen";
    }
  }

  return "unknown";
}

const COMMAND_PREFIXES_TO_SKIP = new Set(["env", "command", "exec", "npx", "pnpm", "bunx", "uvx", "dlx"]);

function isEnvironmentAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/u.test(token);
}

function isWrapperOptionToken(token: string): boolean {
  return /^-[A-Za-z0-9]/u.test(token);
}

function normalizeCommandEntry(token: string): string {
  const normalized = token.trim().replace(/^['"`]+|['"`]+$/gu, "").toLowerCase();
  if (!normalized) {
    return "";
  }

  const bare = normalized.split(/[\\/]/u).pop() ?? normalized;
  return bare.trim();
}
