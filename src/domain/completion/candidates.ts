import type { CompletionCandidate } from "../ai/types";

interface CandidateBuckets {
  local: CompletionCandidate[];
  ai: CompletionCandidate[];
  system: CompletionCandidate[];
}

const SOURCE_PRIORITY: Record<CompletionCandidate["source"], number> = {
  local: 0,
  ai: 1,
  system: 2,
};

const MAX_VISIBLE_CANDIDATES = 5;

export function mergeCompletionCandidates(buckets: CandidateBuckets): CompletionCandidate[] {
  const deduped = new Map<string, CompletionCandidate>();

  for (const candidate of [...buckets.local, ...buckets.ai, ...buckets.system]) {
    const existing = deduped.get(candidate.text);
    if (!existing) {
      deduped.set(candidate.text, candidate);
      continue;
    }

    if (compareCandidates(candidate, existing) < 0) {
      deduped.set(candidate.text, candidate);
    }
  }

  return [...deduped.values()].sort(compareCandidates).slice(0, MAX_VISIBLE_CANDIDATES);
}

export function buildCandidateSuffix(draft: string, candidate: CompletionCandidate | null | undefined): string {
  if (!candidate || !candidate.text.startsWith(draft)) {
    return "";
  }

  return candidate.text.slice(draft.length);
}

export function buildGhostSuffix(draft: string, candidates: CompletionCandidate[]): string {
  return buildCandidateSuffix(draft, candidates[0]);
}

function compareCandidates(left: CompletionCandidate, right: CompletionCandidate): number {
  const leftPriority = SOURCE_PRIORITY[left.source];
  const rightPriority = SOURCE_PRIORITY[right.source];
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.text.localeCompare(right.text);
}
