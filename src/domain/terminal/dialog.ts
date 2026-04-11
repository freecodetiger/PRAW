export type PaneRenderMode = "dialog" | "classic";

export type PaneRenderModeSource = "default" | "manual" | "auto-interactive" | "shell-unsupported";

export type ShellIntegrationStatus = "supported" | "unsupported";

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

export interface DialogState {
  mode: PaneRenderMode;
  modeSource: PaneRenderModeSource;
  shellIntegration: ShellIntegrationStatus;
  cwd: string;
  blocks: CommandBlock[];
  activeCommandBlockId: string | null;
  composerHistory: string[];
}

export type ShellLifecycleEvent =
  | { type: "command-start" }
  | { type: "command-end"; exitCode: number }
  | { type: "prompt-state"; cwd: string };

const AUTO_INTERACTIVE_COMMANDS = new Set([
  "vim",
  "nvim",
  "nano",
  "less",
  "more",
  "man",
  "top",
  "htop",
  "btop",
  "python",
  "ipython",
  "node",
  "ssh",
  "scp",
  "sftp",
  "tmux",
  "fzf",
  "lazygit",
]);

const COMMAND_PREFIXES_TO_SKIP = new Set(["sudo", "env", "command"]);

let nextSessionBlockId = 1;

export function createDialogState(shell: string, cwd: string): DialogState {
  const supported = isDialogShellSupported(shell);

  return {
    mode: supported ? "dialog" : "classic",
    modeSource: supported ? "default" : "shell-unsupported",
    shellIntegration: supported ? "supported" : "unsupported",
    cwd,
    blocks: [],
    activeCommandBlockId: null,
    composerHistory: [],
  };
}

export function submitDialogCommand(
  state: DialogState,
  command: string,
  createId: () => string,
): DialogState {
  const normalizedCommand = command.trim();
  if (normalizedCommand.length === 0) {
    return state;
  }

  const interactive = isAutoInteractiveCommand(normalizedCommand);
  const mode = interactive ? "classic" : state.mode;
  const modeSource: PaneRenderModeSource = interactive ? "auto-interactive" : state.modeSource;
  const id = createId();

  return {
    ...state,
    mode,
    modeSource,
    activeCommandBlockId: id,
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
        interactive,
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
    return {
      ...state,
      blocks: state.blocks.map((block) =>
        block.id === state.activeCommandBlockId ? { ...block, output: `${block.output}${data}` } : block,
      ),
    };
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

export function applyShellLifecycleEvent(state: DialogState, event: ShellLifecycleEvent): DialogState {
  switch (event.type) {
    case "command-start":
      return state;
    case "prompt-state":
      return {
        ...state,
        cwd: event.cwd,
      };
    case "command-end": {
      const nextState =
        state.activeCommandBlockId === null
          ? state
          : {
              ...state,
              activeCommandBlockId: null,
              blocks: state.blocks.map((block): CommandBlock =>
                block.id === state.activeCommandBlockId
                  ? ({
                      ...block,
                      status: "completed",
                      exitCode: event.exitCode,
                    } satisfies CommandBlock)
                  : block,
              ),
            };

      if (nextState.mode === "classic" && nextState.modeSource === "auto-interactive") {
        return {
          ...nextState,
          mode: "dialog",
          modeSource: "default",
        };
      }

      return nextState;
    }
  }
}

export function isDialogShellSupported(shell: string): boolean {
  return /(^|\/)bash$/.test(shell.trim());
}

export function isAutoInteractiveCommand(command: string): boolean {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  let index = 0;
  while (index < tokens.length && COMMAND_PREFIXES_TO_SKIP.has(tokens[index])) {
    index += 1;
  }

  if (index >= tokens.length) {
    return false;
  }

  return AUTO_INTERACTIVE_COMMANDS.has(tokens[index]);
}
