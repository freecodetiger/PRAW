import type { SuggestionItem } from "../../../domain/suggestion/types";
import type { StructuredAgentCapabilities } from "../../../domain/terminal/types";
import {
  buildComposerPlaceholder,
  buildHelpText,
  getFallbackStructuredAgentCapabilities,
  resolveStructuredAgentCapabilities,
  resolveStructuredAgentLabel,
} from "./structured-agent-capabilities";

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

export interface StructuredAiCommandCapabilities {
  provider: StructuredAiProvider;
  label: string;
  supportsResumePicker: boolean;
  supportsDirectResume: boolean;
  supportsReview: boolean;
  supportsModelOverride: boolean;
  showsBypassCapsule: boolean;
}

function getSupportedAiCommands(commandCapabilities: StructuredAiCommandCapabilities): SupportedAiCommandName[] {
  const commands: SupportedAiCommandName[] = ["help", "new"];

  if (commandCapabilities.supportsResumePicker || commandCapabilities.supportsDirectResume) {
    commands.push("resume");
  }
  if (commandCapabilities.supportsReview) {
    commands.push("review");
  }
  if (commandCapabilities.supportsModelOverride) {
    commands.push("model");
  }

  return commands;
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
  return getAiCommandHelpTextForCapabilities(
    getFallbackStructuredAgentCapabilities(provider),
    resolveStructuredAgentLabel(provider),
  );
}

export function getAiCommandHelpTextForCapabilities(
  capabilities: StructuredAgentCapabilities,
  label: string,
): string {
  return buildHelpText(capabilities, label);
}

export function getAiCommandHelpTextForRuntime(commandCapabilities: StructuredAiCommandCapabilities): string {
  return buildHelpText(commandCapabilities, commandCapabilities.label);
}

export function getAiComposerPlaceholder(provider: string): string {
  return getAiComposerPlaceholderForCapabilities(
    getFallbackStructuredAgentCapabilities(provider),
    resolveStructuredAgentLabel(provider),
  );
}

export function getAiComposerPlaceholderForCapabilities(
  capabilities: StructuredAgentCapabilities,
  label: string,
): string {
  return buildComposerPlaceholder(capabilities, label);
}

export function getStructuredAiCommandCapabilities(
  provider: string,
  capabilities?: StructuredAgentCapabilities | null,
): StructuredAiCommandCapabilities {
  const normalized = provider.trim().toLowerCase();
  const resolvedCapabilities = resolveStructuredAgentCapabilities(provider, capabilities);
  const providerId =
    normalized === "codex" || normalized === "qwen" || normalized === "claude" ? normalized : "unknown";

  return {
    provider: providerId,
    label: resolveStructuredAgentLabel(provider),
    supportsResumePicker: resolvedCapabilities.supportsResumePicker,
    supportsDirectResume: resolvedCapabilities.supportsDirectResume,
    supportsReview: resolvedCapabilities.supportsReview,
    supportsModelOverride: resolvedCapabilities.supportsModelOverride,
    showsBypassCapsule: resolvedCapabilities.showsBypassCapsule,
  };
}

export function getAiSlashCommandSuggestions(
  draft: string,
  commandCapabilities: StructuredAiCommandCapabilities,
): SuggestionItem[] {
  const normalized = draft.trim();
  if (!normalized.startsWith("/")) {
    return [];
  }

  const withoutSlash = normalized.slice(1);
  const [commandName = "", ...rest] = withoutSlash.split(/\s+/u);
  if (rest.length > 0) {
    return [];
  }

  const loweredPrefix = commandName.toLowerCase();
  const commands = getSupportedAiCommands(commandCapabilities).filter(
    (command) => loweredPrefix.length === 0 || (command.startsWith(loweredPrefix) && command !== loweredPrefix),
  );

  return commands.map((command, index) => ({
    id: `ai-command:${command}`,
    text: `/${command}`,
    kind: "completion",
    source: "system",
    score: 1 - index * 0.01,
    group: "inline",
    applyMode: "replace",
    replacement: {
      type: "replace-all",
      value: `/${command} `,
    },
  }));
}

export function applyAiSlashCommandSuggestion(draft: string, suggestionText: string): string {
  const trimmed = draft.trim();
  const suffix = trimmed.includes(" ") ? trimmed.slice(trimmed.indexOf(" ")) : "";
  return `${suggestionText}${suffix}`.trimEnd() + " ";
}
