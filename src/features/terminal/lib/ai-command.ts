export type SupportedAiCommandName = "help" | "new" | "resume" | "review" | "model";

export type AiComposerInput =
  | {
      kind: "prompt";
      text: string;
    }
  | {
      kind: "command";
      name: SupportedAiCommandName | "unsupported";
      args: string;
      raw: string;
      originalName?: string;
    };

const SUPPORTED_COMMANDS = new Set<SupportedAiCommandName>(["help", "new", "resume", "review", "model"]);

export function parseAiComposerInput(input: string): AiComposerInput {
  const normalized = input.trim();
  if (!normalized.startsWith("/")) {
    return {
      kind: "prompt",
      text: normalized,
    };
  }

  const withoutSlash = normalized.slice(1);
  const [commandName = "", ...rest] = withoutSlash.split(/\s+/u);
  const args = rest.join(" ").trim();
  const loweredName = commandName.toLowerCase();

  if (SUPPORTED_COMMANDS.has(loweredName as SupportedAiCommandName)) {
    return {
      kind: "command",
      name: loweredName as SupportedAiCommandName,
      args,
      raw: normalized,
    };
  }

  return {
    kind: "command",
    name: "unsupported",
    args,
    raw: normalized,
    originalName: loweredName,
  };
}

export function getAiCommandHelpText(provider: string): string {
  const resolvedProvider = provider.trim() || "AI";

  return [
    `${resolvedProvider} AI mode supports these slash commands:`,
    "/help Show this command guide.",
    "/new Start a fresh structured conversation in the current tab.",
    "/resume Reattach this tab to a previous Codex session.",
    "/review Run a focused Codex review for the current workspace.",
    "/model Show or change the preferred model for new turns when supported.",
    "Unsupported or expert-only commands open the Expert Drawer instead of pretending to run.",
  ].join("\n");
}
