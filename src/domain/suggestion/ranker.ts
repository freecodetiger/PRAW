import type { CompletionContextSnapshot } from "../ai/types";
import type { CommandBlock } from "../terminal/dialog";
import type { SessionCompletionContext, SuggestionItem } from "./types";
import { findLastSuccessfulCommand } from "./workflow";

export interface SuggestionRankingContext {
  draft: string;
  recentCommands: string[];
  blocks?: CommandBlock[];
  localContext?: CompletionContextSnapshot | null;
  sessionContext?: SessionCompletionContext | null;
  suggestions: SuggestionItem[];
}

interface RankedSuggestion {
  item: SuggestionItem;
  rank: number;
}

export interface SuggestionPresentationModel {
  rankedSuggestions: SuggestionItem[];
  ghostSuggestion: SuggestionItem | null;
}

export function rankSuggestionItems(context: SuggestionRankingContext): SuggestionItem[] {
  return buildRankedSuggestions(context).map((entry) => entry.item);
}

export function buildSuggestionPresentationModel(context: SuggestionRankingContext): SuggestionPresentationModel {
  const rankedSuggestions = rankSuggestionItems(context);

  return {
    rankedSuggestions,
    ghostSuggestion: selectRankedGhostSuggestion({
      ...context,
      suggestions: rankedSuggestions,
    }),
  };
}

export function selectRankedGhostSuggestion(context: SuggestionRankingContext): SuggestionItem | null {
  return buildRankedSuggestions(context).map(({ item }) => item).find((item) => isGhostCandidate(context.draft, item)) ?? null;
}

function buildRankedSuggestions(context: SuggestionRankingContext): RankedSuggestion[] {
  const lastSuccessfulCommand = normalizeCommand(findLastSuccessfulCommand(context.blocks, context.recentCommands));
  const deduped = new Map<string, RankedSuggestion>();

  for (const item of context.suggestions) {
    const ranked = {
      item,
      rank: scoreSuggestion(item, context.draft, lastSuccessfulCommand, context.sessionContext ?? null),
    };
    const key = `${item.group}:${item.text}`;
    const existing = deduped.get(key);
    if (!existing || ranked.rank > existing.rank) {
      deduped.set(key, ranked);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.item.group !== right.item.group) {
      return left.item.group === "recovery" ? -1 : 1;
    }

    if (left.rank !== right.rank) {
      return right.rank - left.rank;
    }

    return left.item.text.localeCompare(right.item.text);
  });
}

function scoreSuggestion(
  item: SuggestionItem,
  draft: string,
  lastSuccessfulCommand: string | null,
  sessionContext: SessionCompletionContext | null,
): number {
  let rank = item.score;

  if (item.group === "recovery") {
    rank += 4_000;
  }

  if (item.kind === "intent") {
    rank += 420;
  } else if (item.kind === "correction") {
    rank += 320;
  } else if (item.kind === "completion") {
    rank += 180;
  }

  if (item.source === "ai") {
    rank += 24;
  } else if (item.source === "local") {
    rank += 16;
  } else {
    rank += 8;
  }

  rank += scoreDraftAffinity(draft, item);
  rank += scoreDatabaseAffinity(draft, item);
  rank += scoreSessionFeedback(item, sessionContext);

  if (lastSuccessfulCommand && normalizeCommand(item.text) === lastSuccessfulCommand) {
    rank -= 920;
  }

  return rank;
}

function scoreSessionFeedback(item: SuggestionItem, sessionContext: SessionCompletionContext | null): number {
  if (!sessionContext) {
    return 0;
  }

  return sessionContext.acceptedSuggestions.some(
    (feedback) => feedback.cwd === sessionContext.cwd && normalizeCommand(feedback.text) === normalizeCommand(item.text),
  )
    ? 500
    : 0;
}

function scoreDraftAffinity(draft: string, item: SuggestionItem): number {
  if (draft.length === 0) {
    return item.kind === "intent" ? 48 : 0;
  }

  if (item.text === draft) {
    return -160;
  }

  if (item.text.startsWith(draft)) {
    const suffixLength = item.text.length - draft.length;
    return 220 - Math.min(120, suffixLength * 4);
  }

  return item.replacement.type === "replace-all" ? 24 : -220;
}

function scoreDatabaseAffinity(draft: string, item: SuggestionItem): number {
  const trimmedDraft = draft.trim().toLowerCase();
  const text = item.text.toLowerCase();

  if (
    text.startsWith("mysql ")
    || text.startsWith("mysqldump ")
    || text.startsWith("mysqladmin ")
  ) {
    if (
      trimmedDraft.startsWith("my")
      || trimmedDraft.startsWith("mysql")
      || trimmedDraft.includes("mysql")
    ) {
      return 48;
    }
  }

  return 0;
}

function isGhostCandidate(draft: string, item: SuggestionItem): boolean {
  if (item.group !== "inline") {
    return false;
  }

  if (item.applyMode !== "append" || item.replacement.type !== "append") {
    return false;
  }

  if (item.replacement.suffix.length === 0) {
    return false;
  }

  return item.text.startsWith(draft);
}

function normalizeCommand(command: string | null): string | null {
  return command?.trim().replace(/\s+/g, " ") ?? null;
}
