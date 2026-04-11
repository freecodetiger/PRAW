import type { CompletionRequest } from "../../../domain/ai/types";
import type { LocalCompletionRequest } from "../../../domain/completion/types";
import type { PaneRenderMode } from "../../../domain/terminal/dialog";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";

const MIN_COMPLETION_CHARS = 2;
const MAX_RECENT_COMMANDS = 8;

export interface GhostCompletionContext {
  aiEnabled: boolean;
  apiKey: string;
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
}

export function shouldRequestLocalCompletion(context: GhostCompletionContext): boolean {
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

  return context.aiEnabled && context.apiKey.length > 0;
}

export function buildLocalCompletionRequest(context: GhostCompletionContext): LocalCompletionRequest | null {
  if (!shouldRequestLocalCompletion(context)) {
    return null;
  }

  return {
    cwd: context.cwd,
    inputPrefix: context.draft,
  };
}

export function buildGhostCompletionRequest(context: GhostCompletionContext): CompletionRequest | null {
  if (!shouldRequestGhostCompletion(context)) {
    return null;
  }

  return {
    provider: context.provider,
    model: context.model,
    apiKey: context.apiKey,
    shell: context.shell,
    os: "ubuntu",
    cwd: context.cwd,
    inputPrefix: context.draft,
    recentCommands: context.recentCommands.slice(-MAX_RECENT_COMMANDS),
  };
}

export function applyGhostCompletion(draft: string, suffix: string): string {
  return `${draft}${suffix}`;
}
