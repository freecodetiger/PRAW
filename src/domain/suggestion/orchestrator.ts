import { applySuggestion, mergeSuggestionItems, selectGhostSuggestion } from "./items";
import type {
  CompletionInputMode,
  SessionCompletionContext,
  SourceState,
  SuggestionItem,
  SuggestionSession,
  SuggestionSourceId,
  SuggestionSourceResult,
  SuggestionTrigger,
} from "./types";

const SOURCE_IDS: SuggestionSourceId[] = ["local", "workflow", "ai-inline", "ai-intent", "ai-recovery"];

interface BuildSuggestionSessionInput {
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  trigger: SuggestionTrigger;
  generation: number;
  sourceResults: SuggestionSourceResult[];
  context: SessionCompletionContext;
}

export function createEmptySuggestionSession(generation: number): SuggestionSession {
  return {
    suggestions: [],
    sources: Object.fromEntries(
      SOURCE_IDS.map((sourceId) => [
        sourceId,
        {
          sourceId,
          state: "idle",
        } satisfies SourceState,
      ]),
    ) as Record<SuggestionSourceId, SourceState>,
    activeGroup: null,
    ghostSuggestion: null,
    generation,
  };
}

export function applySourceResult(
  session: SuggestionSession,
  result: SuggestionSourceResult,
): SuggestionSession {
  if (result.generation !== session.generation) {
    return {
      ...session,
      sources: {
        ...session.sources,
        [result.sourceId]: {
          sourceId: result.sourceId,
          state: "stale",
          message: result.message,
        },
      },
    };
  }

  const suggestions = mergeSuggestionItems([...session.suggestions, ...result.suggestions]);
  return {
    ...session,
    suggestions,
    sources: {
      ...session.sources,
      [result.sourceId]: {
        sourceId: result.sourceId,
        state: result.state,
        message: result.message,
      },
    },
    activeGroup: selectActiveGroup({
      suggestions,
      sources: {
        ...session.sources,
        [result.sourceId]: {
          sourceId: result.sourceId,
          state: result.state,
          message: result.message,
        },
      },
      inputMode: "prefix",
      trigger: "automatic",
    }),
    ghostSuggestion: selectGhostSuggestion("", suggestions),
  };
}

export function buildSuggestionSessionPresentation({
  draft,
  inputMode,
  trigger,
  generation,
  sourceResults,
  context,
}: BuildSuggestionSessionInput): SuggestionSession {
  const allowedResults = sourceResults.filter((result) => {
    if (result.sourceId === "ai-intent") {
      return inputMode === "intent" && trigger === "tab";
    }

    return true;
  });

  const ignoredIntentResult = sourceResults.find((result) => result.sourceId === "ai-intent") && !allowedResults.some((result) => result.sourceId === "ai-intent");
  const sources = createEmptySuggestionSession(generation).sources;
  if (ignoredIntentResult) {
    sources["ai-intent"] = {
      sourceId: "ai-intent",
      state: "idle",
    };
  }

  const suggestions = dedupeInOrder(rankForSession({
    suggestions: allowedResults
      .filter((result) => result.generation === generation)
      .flatMap((result) => result.suggestions),
    draft,
    inputMode,
    trigger,
    context,
  }));

  for (const result of allowedResults) {
    sources[result.sourceId] = {
      sourceId: result.sourceId,
      state: result.generation === generation ? result.state : "stale",
      message: result.message,
    };
  }

  return {
    suggestions,
    sources,
    activeGroup: selectActiveGroup({
      suggestions,
      sources,
      inputMode,
      trigger,
    }),
    ghostSuggestion: inputMode === "prefix" ? selectGhostSuggestion(draft, suggestions) : null,
    generation,
  };
}

function dedupeInOrder(suggestions: SuggestionItem[]): SuggestionItem[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.group}:${suggestion.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function rankForSession({
  suggestions,
  draft,
  inputMode,
  trigger,
  context,
}: {
  suggestions: SuggestionItem[];
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  trigger: SuggestionTrigger;
  context: SessionCompletionContext;
}): SuggestionItem[] {
  return [...suggestions].sort((left, right) => {
    const leftScore = scoreSuggestion(left, { draft, inputMode, trigger, context });
    const rightScore = scoreSuggestion(right, { draft, inputMode, trigger, context });
    return rightScore - leftScore || left.text.localeCompare(right.text);
  });
}

function scoreSuggestion(
  item: SuggestionItem,
  context: {
    draft: string;
    inputMode: CompletionInputMode | "recovery";
    trigger: SuggestionTrigger;
    context: SessionCompletionContext;
  },
): number {
  let score = item.score;

  if (context.inputMode === "intent" && context.trigger === "tab" && item.group === "intent" && item.source === "ai") {
    score += 5_000;
  }

  if (context.context.acceptedSuggestions.some((feedback) => feedback.cwd === context.context.cwd && feedback.text === item.text)) {
    score += 500;
  }

  if (item.replacement.type === "append" && applySuggestion(context.draft, item) === item.text) {
    score += 50;
  }

  return score;
}

function selectActiveGroup({
  suggestions,
  sources,
  inputMode,
  trigger,
}: {
  suggestions: SuggestionItem[];
  sources: SuggestionSession["sources"];
  inputMode: CompletionInputMode | "recovery";
  trigger: SuggestionTrigger;
}): SuggestionSession["activeGroup"] {
  if (suggestions.some((suggestion) => suggestion.group === "recovery")) {
    return "recovery";
  }
  if (suggestions.some((suggestion) => suggestion.group === "intent")) {
    return "intent";
  }
  if (suggestions.some((suggestion) => suggestion.group === "inline")) {
    return "inline";
  }

  if (inputMode === "recovery" && sources["ai-recovery"].state !== "idle") {
    return "recovery";
  }

  if (inputMode === "intent" && trigger === "tab" && sources["ai-intent"].state !== "idle") {
    return "intent";
  }

  return null;
}
