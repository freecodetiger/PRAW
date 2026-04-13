import type { CompletionContextSnapshot } from "../ai/types";
import type { CommandBlock } from "../terminal/dialog";
import type { SuggestionItem } from "./types";
import { findLastSuccessfulCommand } from "./workflow";

export interface SuggestionRankingContext {
  draft: string;
  recentCommands: string[];
  blocks?: CommandBlock[];
  localContext?: CompletionContextSnapshot | null;
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
      rank: scoreSuggestion(item, context.draft, lastSuccessfulCommand),
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

function scoreSuggestion(item: SuggestionItem, draft: string, lastSuccessfulCommand: string | null): number {
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

  if (lastSuccessfulCommand && normalizeCommand(item.text) === lastSuccessfulCommand) {
    rank -= 920;
  }

  return rank;
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
