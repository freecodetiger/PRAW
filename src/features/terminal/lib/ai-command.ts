export type SupportedAiCommandName = "help" | "new" | "resume" | "review" | "model";
export type StructuredAiProvider = "codex" | "qwen" | "claude" | "unknown";

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

interface StructuredAiCommandCapabilities {
  provider: StructuredAiProvider;
  label: string;
  supportsResumePicker: boolean;
  supportsDirectResume: boolean;
  supportsReview: boolean;
  supportsModelOverride: boolean;
}

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
  const capabilities = getStructuredAiCommandCapabilities(provider);
  const lines = [
    `${capabilities.label} AI mode supports these slash commands:`,
    "/help Show this command guide.",
    "/new Start a fresh structured conversation in the current tab.",
  ];

  if (capabilities.supportsResumePicker) {
    lines.push("/resume Reattach this tab to a previous Codex session.");
  } else if (capabilities.supportsDirectResume) {
    lines.push("/resume <session-id> Reattach this tab to a previous structured session.");
  }

  if (capabilities.supportsReview) {
    lines.push("/review Run a focused Codex review for the current workspace.");
  }

  if (capabilities.supportsModelOverride) {
    lines.push("/model Show or change the preferred model for new turns when supported.");
  }

  lines.push("Unsupported or expert-only commands open the Expert Drawer instead of pretending to run.");
  return lines.join("\n");
}

export function getAiComposerPlaceholder(provider: string): string {
  const capabilities = getStructuredAiCommandCapabilities(provider);
  const commands = ["/help", "/new"];

  if (capabilities.supportsResumePicker || capabilities.supportsDirectResume) {
    commands.push("/resume");
  }
  if (capabilities.supportsReview) {
    commands.push("/review");
  }
  if (capabilities.supportsModelOverride) {
    commands.push("/model");
  }

  return `Message ${capabilities.label} or use ${commands.join(", ")}`;
}

export function getStructuredAiCommandCapabilities(provider: string): StructuredAiCommandCapabilities {
  const normalized = provider.trim().toLowerCase();

  if (normalized === "codex") {
    return {
      provider: "codex",
      label: "Codex",
      supportsResumePicker: true,
      supportsDirectResume: false,
      supportsReview: true,
      supportsModelOverride: true,
    };
  }

  if (normalized === "qwen") {
    return {
      provider: "qwen",
      label: "Qwen",
      supportsResumePicker: false,
      supportsDirectResume: true,
      supportsReview: false,
      supportsModelOverride: true,
    };
  }

  if (normalized === "claude") {
    return {
      provider: "claude",
      label: "Claude",
      supportsResumePicker: false,
      supportsDirectResume: true,
      supportsReview: false,
      supportsModelOverride: false,
    };
  }

  return {
    provider: "unknown",
    label: "AI",
    supportsResumePicker: false,
    supportsDirectResume: false,
    supportsReview: false,
    supportsModelOverride: false,
  };
}
