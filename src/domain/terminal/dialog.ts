export type PaneRenderMode = "dialog" | "classic";

export type PaneRenderModeSource = "default" | "manual" | "auto-interactive" | "shell-unsupported";

export type ShellIntegrationStatus = "supported" | "unsupported";

export type TerminalPresentation = "default" | "agent-workflow";
export type DialogComposerMode = "command" | "pty";

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

const AUTO_INTERACTIVE_COMMANDS = new Set([
  "python",
  "ipython",
  "node",
  "ssh",
  "scp",
  "sftp",
  "vim",
  "nvim",
  "nano",
  "less",
  "more",
  "man",
  "top",
  "htop",
  "btop",
  "tmux",
  "fzf",
  "lazygit",
]);

const CLASSIC_REQUIRED_COMMANDS = new Set([
  "vim",
  "nvim",
  "nano",
  "less",
  "more",
  "man",
  "top",
  "htop",
  "btop",
  "tmux",
  "fzf",
  "lazygit",
]);

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

const COMMAND_PREFIXES_TO_SKIP = new Set([
  "env",
  "command",
  "exec",
  "npx",
  "pnpm",
  "bunx",
  "uvx",
  "dlx",
]);

const GIT_PAGER_SUBCOMMANDS = new Set([
  "log",
  "diff",
  "show",
  "blame",
  "reflog",
  "whatchanged",
  "shortlog",
]);

let nextSessionBlockId = 1;

export function createDialogState(shell: string, cwd: string, preferredMode: PaneRenderMode = "dialog"): DialogState {
  const supported = isDialogShellSupported(shell);

  return {
    preferredMode,
    mode: supported ? preferredMode : "classic",
    modeSource: supported ? "default" : "shell-unsupported",
    presentation: "default",
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

  const commandKind = classifyCommand(normalizedCommand);
  const startsInClassic = commandKind === "classic-required" || commandKind === "agent-workflow";
  const interactive = commandKind !== "dialog-stream";
  const mode = startsInClassic ? "classic" : state.mode;
  const modeSource: PaneRenderModeSource = startsInClassic ? "auto-interactive" : state.modeSource;
  const id = createId();

  return {
    ...state,
    mode,
    modeSource,
    presentation: state.presentation,
    composerMode: "pty",
    activeCommandBlockId: id,
    captureActiveOutputInTranscript: !startsInClassic,
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
      if (state.activeCommandBlockId !== null && event.entry && classifyCommand(event.entry) === "agent-workflow") {
        return {
          ...state,
          mode: "classic",
          modeSource: "auto-interactive",
          presentation: "agent-workflow",
          captureActiveOutputInTranscript: false,
        };
      }

      if (state.activeCommandBlockId !== null) {
        return state;
      }

      if (event.entry && classifyCommand(event.entry) === "agent-workflow") {
        return {
          ...state,
          mode: "classic",
          modeSource: "auto-interactive",
          presentation: "agent-workflow",
          captureActiveOutputInTranscript: false,
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
      const nextState: DialogState =
        state.activeCommandBlockId === null
          ? state
          : {
              ...state,
              composerMode: "command",
              activeCommandBlockId: null,
              captureActiveOutputInTranscript: true,
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
  return classifyCommand(command) !== "dialog-stream";
}

export function isAgentWorkflowCommand(command: string): boolean {
  return classifyCommand(command) === "agent-workflow";
}

export function requireClassicTerminal(state: DialogState): DialogState {
  if (state.activeCommandBlockId === null || state.presentation === "agent-workflow" || state.mode === "classic") {
    return state;
  }

  return {
    ...state,
    mode: "classic",
    modeSource: "auto-interactive",
    captureActiveOutputInTranscript: false,
  };
}

function restorePreferredPresentation(state: DialogState): DialogState {
  if (state.shellIntegration === "unsupported") {
    return {
      ...state,
      mode: "classic",
      modeSource: "shell-unsupported",
      presentation: "default",
      composerMode: "command",
      captureActiveOutputInTranscript: true,
    };
  }

  return {
    ...state,
    mode: state.preferredMode,
    modeSource: "default",
    presentation: "default",
    composerMode: state.activeCommandBlockId === null ? "command" : "pty",
    captureActiveOutputInTranscript: true,
  };
}

type CommandKind = "dialog-stream" | "dialog-interactive" | "classic-required" | "agent-workflow";

function classifyCommand(command: string): CommandKind {
  const entry = resolvePrimaryCommand(command);
  if (!entry) {
    return "dialog-stream";
  }

  if (entry === "sudo" || SHELL_CONTINUATION_COMMANDS.has(entry)) {
    return "dialog-interactive";
  }
  if (isAgentWorkflowEntry(entry)) {
    return "agent-workflow";
  }
  if (entry === "git" && isGitPagerCommand(command)) {
    return "classic-required";
  }
  if (AUTO_INTERACTIVE_COMMANDS.has(entry)) {
    return CLASSIC_REQUIRED_COMMANDS.has(entry) ? "classic-required" : "dialog-interactive";
  }

  return "dialog-stream";
}

function isGitPagerCommand(command: string): boolean {
  const words = resolveCommandWords(command);
  if (words[0] !== "git") {
    return false;
  }

  let index = 1;
  while (index < words.length) {
    const token = words[index];
    if (!token) {
      break;
    }

    if (token === "--no-pager") {
      return false;
    }

    if (token === "-c" || token === "-C" || token === "--git-dir" || token === "--work-tree") {
      index += 2;
      continue;
    }

    if (token.startsWith("-c") || token.startsWith("--config-env=") || token.startsWith("--git-dir=") || token.startsWith("--work-tree=") || token.startsWith("-C")) {
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      index += 1;
      continue;
    }

    return GIT_PAGER_SUBCOMMANDS.has(token);
  }

  return false;
}

function resolvePrimaryCommand(command: string): string | null {
  const words = resolveCommandWords(command);
  return words[0] ?? null;
}

function resolveCommandWords(command: string): string[] {
  const tokens = command.trim().split(/\s+/).filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isEnvironmentAssignmentToken(token) || isWrapperOptionToken(token)) {
      continue;
    }

    const entry = normalizeCommandEntry(token);
    if (!entry || COMMAND_PREFIXES_TO_SKIP.has(entry)) {
      continue;
    }

    return [entry, ...tokens.slice(index + 1).map(normalizeCommandToken)];
  }

  return [];
}

function isAgentWorkflowEntry(entry: string): boolean {
  return entry === "claude" || entry === "claude-code" || entry === "codex";
}

function isEnvironmentAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/u.test(token.trim());
}

function isWrapperOptionToken(token: string): boolean {
  return /^-{1,2}[A-Za-z0-9][A-Za-z0-9-]*$/u.test(token.trim());
}

function normalizeCommandEntry(token: string): string {
  const bare = token.replace(/^['"`]|['"`]$/g, "").toLowerCase();
  const slashIndex = bare.lastIndexOf("/");
  return slashIndex >= 0 ? bare.slice(slashIndex + 1) : bare;
}

function normalizeCommandToken(token: string): string {
  return token.replace(/^['"`]|['"`]$/g, "").toLowerCase();
}
