import type { SuggestionItem } from "./types";

const SOURCE_PRIORITY: Record<SuggestionItem["source"], number> = {
  local: 0,
  ai: 1,
  system: 2,
};

const GROUP_PRIORITY: Record<SuggestionItem["group"], number> = {
  recovery: 0,
  inline: 1,
};

const INLINE_KIND_PRIORITY: Record<SuggestionItem["kind"], number> = {
  completion: 0,
  correction: 1,
  intent: 2,
  recovery: 3,
};

export function applySuggestion(draft: string, suggestion: SuggestionItem): string {
  if (suggestion.replacement.type === "append") {
    return `${draft}${suggestion.replacement.suffix}`;
  }

  return suggestion.replacement.value;
}

export function selectGhostSuggestion(draft: string, suggestions: SuggestionItem[]): SuggestionItem | null {
  return (
    mergeSuggestionItems(suggestions).find(
      (suggestion) =>
        suggestion.group === "inline" &&
        suggestion.kind === "completion" &&
        suggestion.applyMode === "append" &&
        suggestion.replacement.type === "append" &&
        suggestion.text.startsWith(draft),
    ) ?? null
  );
}

export function mergeSuggestionItems(suggestions: SuggestionItem[]): SuggestionItem[] {
  const deduped = new Map<string, SuggestionItem>();

  for (const suggestion of suggestions) {
    const key = `${suggestion.group}:${suggestion.text}`;
    const existing = deduped.get(key);
    if (!existing || compareSuggestionItems(suggestion, existing) < 0) {
      deduped.set(key, suggestion);
    }
  }

  return [...deduped.values()].sort(compareSuggestionItems);
}

function compareSuggestionItems(left: SuggestionItem, right: SuggestionItem): number {
  const groupPriority = GROUP_PRIORITY[left.group] - GROUP_PRIORITY[right.group];
  if (groupPriority !== 0) {
    return groupPriority;
  }

  const kindPriority = INLINE_KIND_PRIORITY[left.kind] - INLINE_KIND_PRIORITY[right.kind];
  if (kindPriority !== 0) {
    return kindPriority;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const sourcePriority = SOURCE_PRIORITY[left.source] - SOURCE_PRIORITY[right.source];
  if (sourcePriority !== 0) {
    return sourcePriority;
  }

  return left.text.localeCompare(right.text);
}
