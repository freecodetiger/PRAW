const MIN_PHRASE_PREFIX = 2;

export interface PhraseMatch {
  phrase: string;
  suffix: string;
  usageScore: number;
  importIndex: number;
}

export function normalizeImportedPhraseText(rawText: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const line of rawText.split(/\r?\n/u)) {
    const phrase = line.trim();
    if (!phrase || seen.has(phrase)) {
      continue;
    }

    seen.add(phrase);
    phrases.push(phrase);
  }

  return phrases;
}

export function getPhraseMatches(
  draft: string,
  phrases: string[],
  usage: Record<string, number>,
): PhraseMatch[] {
  if (draft.trim().length < MIN_PHRASE_PREFIX) {
    return [];
  }

  return phrases
    .map((phrase, importIndex) => ({
      phrase,
      importIndex,
      usageScore: usage[phrase] ?? -1,
    }))
    .filter(({ phrase }) => phrase.startsWith(draft) && phrase !== draft)
    .sort((left, right) => {
      if (left.usageScore !== right.usageScore) {
        return right.usageScore - left.usageScore;
      }

      return left.importIndex - right.importIndex;
    })
    .map(({ phrase, importIndex, usageScore }) => ({
      phrase,
      importIndex,
      usageScore,
      suffix: phrase.slice(draft.length),
    }));
}

export function getNextPhraseSelection(
  currentIndex: number,
  total: number,
  direction: "previous" | "next",
): number {
  if (total <= 0) {
    return 0;
  }

  return direction === "next"
    ? (currentIndex + 1) % total
    : (currentIndex - 1 + total) % total;
}
