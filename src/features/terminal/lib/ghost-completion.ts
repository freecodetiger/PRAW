import { hasAiProviderCapability } from "../../../domain/ai/catalog";
import type { CompletionRequest, CompletionContextSnapshot } from "../../../domain/ai/types";
import type { LocalCompletionRequest } from "../../../domain/completion/types";
import type { PaneRenderMode } from "../../../domain/terminal/dialog";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";

const MIN_COMPLETION_CHARS = 2;
const MAX_RECENT_COMMANDS = 10;
const DANGEROUS_PREFIXES = ["rm -rf /", "mkfs", "dd if=", "shutdown", "reboot"];

export interface GhostCompletionContext {
  aiEnabled: boolean;
  apiKey: string;
  baseUrl: string;
  provider: CompletionRequest["provider"];
  model: string;
  shell: string;
  cwd: string;
  draft: string;
  recentCommands: string[];
  status: TerminalSessionStatus;
  mode: PaneRenderMode;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
  suppressAsyncCompletion?: boolean;
  sessionId: string;
  userId: string;
  localContext: CompletionContextSnapshot | null;
}

export function shouldRequestLocalCompletion(context: GhostCompletionContext): boolean {
  if (context.suppressAsyncCompletion) {
    return false;
  }

  if (context.status !== "running" || context.mode !== "dialog") {
    return false;
  }

  if (!context.cursorAtEnd || context.browsingHistory || context.isComposing || !context.isFocused) {
    return false;
  }

  return context.draft.trim().length >= MIN_COMPLETION_CHARS;
}

export function shouldRequestGhostCompletion(context: GhostCompletionContext): boolean {
  if (!shouldRequestLocalCompletion(context)) {
    return false;
  }

  if (!context.aiEnabled || context.apiKey.length === 0) {
    return false;
  }

  if (context.model.trim().length === 0) {
    return false;
  }

  if (!hasAiProviderCapability(context.provider, "completion")) {
    return false;
  }

  if (!context.localContext) {
    return false;
  }

  return !isDangerousPrefix(context.draft);
}

export function buildLocalCompletionRequest(context: GhostCompletionContext): LocalCompletionRequest | null {
  if (!shouldRequestLocalCompletion(context)) {
    return null;
  }

  return {
    cwd: context.cwd,
    inputPrefix: context.draft,
    shell: context.shell,
    recentHistory: context.recentCommands.slice(-MAX_RECENT_COMMANDS),
  };
}

export function buildGhostCompletionRequest(context: GhostCompletionContext): CompletionRequest | null {
  if (!shouldRequestGhostCompletion(context) || !context.localContext) {
    return null;
  }

  return {
    provider: context.provider,
    model: context.model,
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    prefix: context.draft,
    pwd: context.localContext.pwd,
    gitBranch: context.localContext.gitBranch,
    gitStatusSummary: context.localContext.gitStatusSummary,
    recentHistory: context.localContext.recentHistory,
    cwdSummary: context.localContext.cwdSummary,
    systemSummary: context.localContext.systemSummary,
    toolAvailability: context.localContext.toolAvailability,
    sessionId: context.sessionId,
    userId: context.userId,
  };
}

export function applyGhostCompletion(draft: string, suffix: string): string {
  return `${draft}${suffix}`;
}

function isDangerousPrefix(draft: string): boolean {
  const trimmed = draft.trim().toLowerCase();
  return DANGEROUS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
