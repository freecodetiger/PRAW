import type { CompletionCandidate, CompletionRequest } from "../../../domain/ai/types";
import type { LocalCompletionRequest } from "../../../domain/completion/types";
import type { SuggestionItem, AiInlineSuggestionRequest, AiRecoverySuggestionRequest } from "../../../domain/suggestion/types";
import type { CommandBlock, PaneRenderMode } from "../../../domain/terminal/dialog";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";

const MIN_INLINE_SUGGESTION_CHARS = 2;
const MAX_RECENT_COMMANDS = 10;
const MAX_RECOVERY_OUTPUT_CHARS = 2_000;
const DANGEROUS_PREFIXES = ["rm -rf /", "mkfs", "dd if=", "shutdown", "reboot"];

export interface SuggestionEngineContext {
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
  suppressInlineSuggestions?: boolean;
  sessionId: string;
  userId: string;
  localContext: AiInlineSuggestionRequest | null | import("../../../domain/ai/types").CompletionContextSnapshot | null;
}

export function shouldRequestLocalInlineSuggestions(context: SuggestionEngineContext): boolean {
  if (!shouldRequestLocalContext(context)) {
    return false;
  }

  return context.draft.trim().length >= MIN_INLINE_SUGGESTION_CHARS;
}

export function shouldRequestLocalContext(context: SuggestionEngineContext): boolean {
  if (context.suppressInlineSuggestions) {
    return false;
  }

  if (context.status !== "running" || context.mode !== "dialog") {
    return false;
  }

  if (!context.cursorAtEnd || context.browsingHistory || context.isComposing || !context.isFocused) {
    return false;
  }

  return true;
}

export function shouldRequestAiInlineSuggestions(context: SuggestionEngineContext): boolean {
  if (!shouldRequestLocalInlineSuggestions(context)) {
    return false;
  }

  if (!context.aiEnabled || context.apiKey.length === 0) {
    return false;
  }

  if (context.provider !== "glm" || context.model.trim().length === 0) {
    return false;
  }

  if (!context.localContext) {
    return false;
  }

  return !isDangerousPrefix(context.draft);
}

export function shouldRequestRecoverySuggestions(
  context: SuggestionEngineContext,
  failedBlock: CommandBlock | null,
): boolean {
  if (!context.aiEnabled || context.apiKey.length === 0) {
    return false;
  }

  if (context.provider !== "glm" || context.model.trim().length === 0) {
    return false;
  }

  if (context.status !== "running" || context.mode !== "dialog") {
    return false;
  }

  if (!context.isFocused || context.browsingHistory || context.isComposing) {
    return false;
  }

  if (!failedBlock || failedBlock.exitCode === null || failedBlock.exitCode === 0 || !failedBlock.command) {
    return false;
  }

  return context.draft.trim().length === 0;
}

export function buildLocalCompletionRequest(context: SuggestionEngineContext): LocalCompletionRequest | null {
  if (!shouldRequestLocalContext(context)) {
    return null;
  }

  return {
    cwd: context.cwd,
    inputPrefix: context.draft,
    shell: context.shell,
    recentHistory: context.recentCommands.slice(-MAX_RECENT_COMMANDS),
  };
}

export function buildAiInlineSuggestionRequest(context: SuggestionEngineContext): AiInlineSuggestionRequest | null {
  if (!shouldRequestAiInlineSuggestions(context) || !context.localContext) {
    return null;
  }

  return {
    provider: context.provider,
    model: context.model,
    apiKey: context.apiKey,
    draft: context.draft,
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

export function buildRecoverySuggestionRequest(
  context: SuggestionEngineContext,
  failedBlock: CommandBlock | null,
): AiRecoverySuggestionRequest | null {
  if (
    !context.aiEnabled ||
    context.apiKey.length === 0 ||
    context.provider !== "glm" ||
    context.model.trim().length === 0 ||
    !failedBlock?.command ||
    failedBlock.exitCode === null ||
    failedBlock.exitCode === 0
  ) {
    return null;
  }

  return {
    provider: context.provider,
    model: context.model,
    apiKey: context.apiKey,
    command: failedBlock.command,
    output: failedBlock.output.slice(-MAX_RECOVERY_OUTPUT_CHARS),
    exitCode: failedBlock.exitCode,
    cwd: failedBlock.cwd,
    shell: context.shell,
    recentHistory: context.recentCommands.slice(-MAX_RECENT_COMMANDS),
    sessionId: context.sessionId,
    userId: context.userId,
  };
}

export function buildSuggestionFromLocalCandidate(draft: string, candidate: CompletionCandidate): SuggestionItem {
  const suffix = candidate.text.startsWith(draft) ? candidate.text.slice(draft.length) : "";

  return {
    id: `${candidate.source}:${candidate.kind}:${candidate.text}`,
    text: candidate.text,
    kind: "completion",
    source: candidate.source,
    score: candidate.score,
    group: "inline",
    applyMode: "append",
    replacement: {
      type: "append",
      suffix,
    },
  };
}

export function findMostRecentFailedCommandBlock(blocks: CommandBlock[]): CommandBlock | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (
      block?.kind === "command" &&
      block.status === "completed" &&
      block.exitCode !== null &&
      block.exitCode !== 0 &&
      block.command
    ) {
      return block;
    }
  }

  return null;
}

function isDangerousPrefix(draft: string): boolean {
  const trimmed = draft.trim().toLowerCase();
  return DANGEROUS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
