import type { StructuredAgentCapabilities } from "../../../domain/terminal/types";

export const DEFAULT_STRUCTURED_AGENT_CAPABILITIES: StructuredAgentCapabilities = {
  supportsResumePicker: false,
  supportsDirectResume: false,
  supportsReview: false,
  supportsModelOverride: false,
  showsBypassCapsule: true,
};

export function getFallbackStructuredAgentCapabilities(provider: string): StructuredAgentCapabilities {
  const normalized = provider.trim().toLowerCase();

  if (normalized === "codex") {
    return {
      supportsResumePicker: true,
      supportsDirectResume: false,
      supportsReview: true,
      supportsModelOverride: true,
      showsBypassCapsule: true,
    };
  }

  if (normalized === "qwen") {
    return {
      supportsResumePicker: false,
      supportsDirectResume: true,
      supportsReview: false,
      supportsModelOverride: true,
      showsBypassCapsule: true,
    };
  }

  if (normalized === "claude") {
    return {
      supportsResumePicker: false,
      supportsDirectResume: true,
      supportsReview: false,
      supportsModelOverride: false,
      showsBypassCapsule: true,
    };
  }

  return DEFAULT_STRUCTURED_AGENT_CAPABILITIES;
}

export function resolveStructuredAgentCapabilities(
  provider: string,
  capabilities?: StructuredAgentCapabilities | null,
): StructuredAgentCapabilities {
  return capabilities ?? getFallbackStructuredAgentCapabilities(provider);
}

export function resolveStructuredAgentLabel(provider: string): string {
  const normalized = provider.trim().toLowerCase();

  if (normalized === "codex") {
    return "Codex";
  }
  if (normalized === "qwen") {
    return "Qwen";
  }
  if (normalized === "claude") {
    return "Claude";
  }

  return "AI";
}

export function buildComposerPlaceholder(capabilities: StructuredAgentCapabilities, label: string): string {
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

  return `Message ${label} or use ${commands.join(", ")}`;
}

export function buildHelpText(capabilities: StructuredAgentCapabilities, label: string): string {
  const lines = [
    `${label} AI mode supports these slash commands:`,
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
