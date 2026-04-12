export type PaneRenderMode = "dialog" | "classic";

export type PaneRenderModeSource = "default" | "manual" | "auto-interactive" | "shell-unsupported";

export type ShellIntegrationStatus = "supported" | "unsupported";

export type TerminalPresentation = "default" | "agent-workflow";

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
  preferredMode: PaneRenderMode;
  mode: PaneRenderMode;
  modeSource: PaneRenderModeSource;
  presentation: TerminalPresentation;
  shellIntegration: ShellIntegrationStatus;
  cwd: string;
  blocks: CommandBlock[];
  activeCommandBlockId: string | null;
  composerHistory: string[];
}

export type ShellLifecycleEvent =
  | { type: "command-start"; entry?: string }
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

const AGENT_WORKFLOW_COMMANDS = new Set(["codex", "claude"]);

const SHELL_CONTINUATION_COMMANDS = new Set([
  "if",
  "for",
  "while",
  "until",
  "case",
  "select",
  "function",
  "{",
  "(",
]);

const COMMAND_PREFIXES_TO_SKIP = new Set(["env", "command", "npx", "pnpm", "bunx", "uvx"]);

let nextSessionBlockId = 1;

export function createDialogState(shell: string, cwd: string, preferredMode: PaneRenderMode = "dialog"): DialogState {
  const supported = isDialogShellSupported(shell);

  return {
    preferredMode,
    mode: supported ? preferredMode : "classic",
    modeSource: supported ? "default" : "shell-unsupported",
    presentation: "default",
    shellIntegration: supported ? "supported" : "unsupported",
    cwd,
    blocks: [],
    activeCommandBlockId: null,
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

  const commandKind = classifyCommand(normalizedCommand);
  const interactive = commandKind !== "default";
  const mode = interactive ? "classic" : state.mode;
  const modeSource: PaneRenderModeSource = interactive ? "auto-interactive" : state.modeSource;
  const presentation: TerminalPresentation =
    commandKind === "agent-workflow" ? "agent-workflow" : state.presentation;
  const id = createId();

  return {
    ...state,
    mode,
    modeSource,
    presentation,
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
    case "command-start": {
      if (state.activeCommandBlockId !== null) {
        return state;
      }

      if (event.entry && classifyCommand(event.entry) === "agent-workflow") {
        return {
          ...state,
          mode: "classic",
          modeSource: "auto-interactive",
          presentation: "agent-workflow",
        };
      }

      return state;
    }
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

      if (nextState.modeSource === "auto-interactive" || nextState.presentation === "agent-workflow") {
        return restorePreferredPresentation(nextState);
      }

      return nextState;
    }
  }
}

export function isDialogShellSupported(shell: string): boolean {
  return /(^|\/)bash$/.test(shell.trim());
}

export function isAutoInteractiveCommand(command: string): boolean {
  return classifyCommand(command) !== "default";
}

export function isAgentWorkflowCommand(command: string): boolean {
  return classifyCommand(command) === "agent-workflow";
}

function restorePreferredPresentation(state: DialogState): DialogState {
  if (state.shellIntegration === "unsupported") {
    return {
      ...state,
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
    };
  }

  return {
    ...state,
    mode: state.preferredMode,
    modeSource: "default",
    presentation: "default",
  };
}

function classifyCommand(command: string): "default" | "interactive" | "agent-workflow" {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return "default";
  }

  let index = 0;
  while (index < tokens.length && COMMAND_PREFIXES_TO_SKIP.has(normalizeCommandEntry(tokens[index]))) {
    index += 1;
  }

  if (index >= tokens.length) {
    return "default";
  }

  const entry = normalizeCommandEntry(tokens[index]);
  if (entry === "sudo" || SHELL_CONTINUATION_COMMANDS.has(entry)) {
    return "interactive";
  }
  if (AGENT_WORKFLOW_COMMANDS.has(entry)) {
    return "agent-workflow";
  }

  if (AUTO_INTERACTIVE_COMMANDS.has(entry)) {
    return "interactive";
  }

  return "default";
}

function normalizeCommandEntry(token: string): string {
  const bare = token.replace(/^['"`]|['"`]$/g, "").toLowerCase();
  const slashIndex = bare.lastIndexOf("/");
  return slashIndex >= 0 ? bare.slice(slashIndex + 1) : bare;
}
