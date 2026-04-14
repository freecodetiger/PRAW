import type { TerminalSemanticEvent } from "./types";

export type PaneRenderMode = "dialog" | "classic";

export type PaneRenderModeSource = "default" | "manual" | "auto-interactive" | "shell-unsupported";

export type ShellIntegrationStatus = "supported" | "unsupported";

export type TerminalPresentation = "default" | "agent-workflow";
export type DialogComposerMode = "command" | "pty";
export type DialogPhase = "idle" | "live-console" | "classic-handoff";
export type TranscriptPolicy = "append-live" | "defer-until-exit";

export type CommandBlockKind = "command" | "session";

export type CommandBlockStatus = "running" | "completed";

export interface CommandBlock {
  id: string;
  kind: CommandBlockKind;
  cwd: string;
  command: string | null;
  output: string;
  status: CommandBlockStatus;
  interactive: boolean;
  exitCode: number | null;
}

export interface LiveConsoleState {
  blockId: string;
  compact: boolean;
  transcriptCapture: string;
}

export interface DialogState {
  preferredMode: PaneRenderMode;
  mode: PaneRenderMode;
  modeSource: PaneRenderModeSource;
  presentation: TerminalPresentation;
  dialogPhase: DialogPhase;
  liveConsole: LiveConsoleState | null;
  transcriptPolicy: TranscriptPolicy;
  composerMode: DialogComposerMode;
  shellIntegration: ShellIntegrationStatus;
  cwd: string;
  blocks: CommandBlock[];
  activeCommandBlockId: string | null;
  captureActiveOutputInTranscript: boolean;
  composerHistory: string[];
}

export type ShellLifecycleEvent =
  | { type: "command-start"; entry?: string }
  | { type: "command-end"; exitCode: number }
  | { type: "prompt-state"; cwd: string };

let nextSessionBlockId = 1;

export function createDialogState(shell: string, cwd: string, preferredMode: PaneRenderMode = "dialog"): DialogState {
  const supported = isDialogShellSupported(shell);

  return {
    preferredMode,
    mode: supported ? preferredMode : "classic",
    modeSource: supported ? "default" : "shell-unsupported",
    presentation: "default",
    dialogPhase: "idle",
    liveConsole: null,
    transcriptPolicy: "append-live",
    composerMode: "command",
    shellIntegration: supported ? "supported" : "unsupported",
    cwd,
    blocks: [],
    activeCommandBlockId: null,
    captureActiveOutputInTranscript: true,
    composerHistory: [],
  };
}

export function applyPreferredMode(state: DialogState, preferredMode: PaneRenderMode): DialogState {
  const nextState: DialogState = {
    ...state,
    preferredMode,
  };

  if (nextState.shellIntegration === "unsupported") {
    return {
      ...nextState,
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
      dialogPhase: "idle",
      liveConsole: null,
      transcriptPolicy: "append-live",
      composerMode: "command",
    };
  }

  if (nextState.modeSource === "auto-interactive" || nextState.activeCommandBlockId !== null) {
    return nextState;
  }

  return {
    ...nextState,
    mode: preferredMode,
    modeSource: "default",
    presentation: "default",
  };
}

export function submitDialogCommand(
  state: DialogState,
  command: string,
  createId: () => string,
): DialogState {
  const normalizedCommand = command.trim();
  if (normalizedCommand.length === 0 || state.activeCommandBlockId !== null) {
    return state;
  }

  const id = createId();

  return {
    ...state,
    mode: state.mode,
    modeSource: state.modeSource,
    presentation: state.presentation,
    dialogPhase: "live-console",
    liveConsole: {
      blockId: id,
      compact: false,
      transcriptCapture: "",
    },
    transcriptPolicy: "defer-until-exit",
    composerMode: "pty",
    activeCommandBlockId: id,
    captureActiveOutputInTranscript: false,
    composerHistory: [...state.composerHistory, normalizedCommand],
    blocks: [
      ...state.blocks,
      {
        id,
        kind: "command",
        cwd: state.cwd,
        command: normalizedCommand,
        output: "",
        status: "running",
        interactive: false,
        exitCode: null,
      },
    ],
  };
}

export function appendDialogOutput(state: DialogState, data: string): DialogState {
  if (data.length === 0) {
    return state;
  }

  if (state.activeCommandBlockId) {
    if (!state.captureActiveOutputInTranscript) {
      return state;
    }

    return {
      ...state,
      blocks: state.blocks.map((block) =>
        block.id === state.activeCommandBlockId ? { ...block, output: `${block.output}${data}` } : block,
      ),
    };
  }

  if (state.composerHistory.length === 0) {
    return state;
  }

  if (data.trim().length === 0) {
    return state;
  }

  const lastBlock = state.blocks[state.blocks.length - 1];
  if (lastBlock?.kind === "session") {
    return {
      ...state,
      blocks: [
        ...state.blocks.slice(0, -1),
        {
          ...lastBlock,
          output: `${lastBlock.output}${data}`,
        },
      ],
    };
  }

  return {
    ...state,
    blocks: [
      ...state.blocks,
      {
        id: `session:${nextSessionBlockId++}`,
        kind: "session",
        cwd: state.cwd,
        command: null,
        output: data,
        status: "completed",
        interactive: false,
        exitCode: null,
      },
    ],
  };
}

export function appendLiveConsoleOutput(state: DialogState, data: string): DialogState {
  if (data.length === 0 || !state.liveConsole) {
    return state;
  }

  return {
    ...state,
    liveConsole: {
      ...state.liveConsole,
      transcriptCapture: `${state.liveConsole.transcriptCapture}${data}`,
    },
  };
}

export function applyShellLifecycleEvent(state: DialogState, event: ShellLifecycleEvent): DialogState {
  switch (event.type) {
    case "command-start": {
      return state;
    }
    case "prompt-state":
      return {
        ...state,
        cwd: event.cwd,
      };
    case "command-end": {
      const nextState: DialogState =
        state.activeCommandBlockId === null
          ? state
          : {
              ...state,
              dialogPhase: "idle",
              liveConsole: null,
              transcriptPolicy: "append-live",
              composerMode: "command",
              activeCommandBlockId: null,
              captureActiveOutputInTranscript: true,
              blocks: state.blocks.map((block): CommandBlock =>
                block.id === state.activeCommandBlockId
                  ? ({
                      ...block,
                      output:
                        state.transcriptPolicy === "defer-until-exit" && state.liveConsole?.blockId === block.id
                          ? state.liveConsole.transcriptCapture
                          : block.output,
                      status: "completed",
                      exitCode: event.exitCode,
                    } satisfies CommandBlock)
                  : block,
              ),
            };

      if (nextState.modeSource === "auto-interactive" || nextState.presentation === "agent-workflow") {
        return restorePreferredPresentation(nextState);
      }

      return nextState;
    }
  }
}

export function isDialogShellSupported(shell: string): boolean {
  return /(^|\/)(bash|zsh)$/.test(shell.trim());
}

export function applyTerminalSemanticEvent(state: DialogState, event: TerminalSemanticEvent): DialogState {
  const interactiveState = markActiveCommandInteractive(state);

  switch (event.kind) {
    case "interactive":
      return interactiveState;
    case "classic-required": {
      if (interactiveState.activeCommandBlockId === null || interactiveState.presentation === "agent-workflow") {
        return interactiveState;
      }

      if (interactiveState.mode === "classic" && interactiveState.modeSource === "auto-interactive") {
        return interactiveState;
      }

      return {
        ...interactiveState,
        mode: "classic",
        modeSource: "auto-interactive",
        dialogPhase: "classic-handoff",
        captureActiveOutputInTranscript: false,
      };
    }
    case "agent-workflow":
      if (interactiveState.presentation === "agent-workflow") {
        return interactiveState;
      }

      return {
        ...interactiveState,
        mode: "classic",
        modeSource: "auto-interactive",
        presentation: "agent-workflow",
        dialogPhase: interactiveState.activeCommandBlockId === null ? "idle" : "classic-handoff",
        captureActiveOutputInTranscript: false,
      };
  }
}

function markActiveCommandInteractive(state: DialogState): DialogState {
  if (state.activeCommandBlockId === null) {
    return state;
  }

  let changed = false;
  const blocks = state.blocks.map((block) => {
    if (block.id !== state.activeCommandBlockId || block.interactive) {
      return block;
    }

    changed = true;
    return {
      ...block,
      interactive: true,
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    blocks,
  };
}

function restorePreferredPresentation(state: DialogState): DialogState {
  if (state.shellIntegration === "unsupported") {
    return {
      ...state,
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
      dialogPhase: "idle",
      liveConsole: null,
      transcriptPolicy: "append-live",
      composerMode: "command",
      captureActiveOutputInTranscript: true,
    };
  }

  return {
    ...state,
    mode: state.preferredMode,
    modeSource: "default",
    presentation: "default",
    dialogPhase: state.activeCommandBlockId === null ? "idle" : "live-console",
    liveConsole:
      state.activeCommandBlockId === null
        ? null
        : {
            blockId: state.activeCommandBlockId,
            compact: state.liveConsole?.compact ?? false,
            transcriptCapture: state.liveConsole?.transcriptCapture ?? "",
          },
    transcriptPolicy: state.activeCommandBlockId === null ? "append-live" : "defer-until-exit",
    composerMode: state.activeCommandBlockId === null ? "command" : "pty",
    captureActiveOutputInTranscript: true,
  };
}
