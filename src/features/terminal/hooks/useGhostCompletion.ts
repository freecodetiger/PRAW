import { useEffect, useRef, useState } from "react";

import type { CompletionCandidate, CompletionRequest } from "../../../domain/ai/types";
import { buildGhostSuffix, mergeCompletionCandidates } from "../../../domain/completion/candidates";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { requestGhostCompletion } from "../../../lib/tauri/ai";
import { requestLocalCompletion } from "../../../lib/tauri/completion";
import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  applyGhostCompletion,
  buildGhostCompletionRequest,
  buildLocalCompletionRequest,
} from "../lib/ghost-completion";
import type { TerminalTabViewState } from "../state/terminal-view-store";

const COMPLETION_DEBOUNCE_MS = 180;
const USER_ID_STORAGE_KEY = "praw-completion-user-id";

interface UseGhostCompletionOptions {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  draft: string;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
  disabled?: boolean;
}

interface GhostCompletionState {
  suggestion: string;
  candidates: CompletionCandidate[];
  clearSuggestion: () => void;
  acceptSuggestion: (index?: number) => string | null;
}

export function useGhostCompletion({
  paneState,
  status,
  draft,
  cursorAtEnd,
  browsingHistory,
  isComposing,
  isFocused,
  disabled = false,
}: UseGhostCompletionOptions): GhostCompletionState {
  const aiConfig = useAppConfigStore((state) => state.config.ai);
  const [candidates, setCandidates] = useState<CompletionCandidate[]>([]);
  const generationRef = useRef(0);
  const sessionIdRef = useRef(crypto.randomUUID());
  const userIdRef = useRef(getOrCreateUserId());

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setCandidates([]);

    const baseContext = {
      aiEnabled: aiConfig.enabled,
      apiKey: aiConfig.apiKey,
      provider: aiConfig.provider as CompletionRequest["provider"],
      model: aiConfig.model,
      shell: paneState.shell,
      cwd: paneState.cwd,
      draft,
      recentCommands: paneState.composerHistory,
      status,
      mode: paneState.mode,
      cursorAtEnd,
      browsingHistory,
      isComposing,
      isFocused,
      suppressAsyncCompletion: disabled,
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
      localContext: null,
    };

    const localRequest = buildLocalCompletionRequest(baseContext);
    if (!localRequest) {
      return;
    }

    const timer = window.setTimeout(() => {
      const run = async () => {
        const localResponse = await requestLocalCompletion(localRequest);
        if (generationRef.current !== generation) {
          return;
        }

        const localCandidates = localResponse?.suggestions ?? [];
        const localMerged = mergeCompletionCandidates({
          local: localCandidates.filter((candidate) => candidate.source === "local"),
          ai: [],
          system: localCandidates.filter((candidate) => candidate.source === "system"),
        });
        setCandidates(localMerged);

        const aiRequest = buildGhostCompletionRequest({
          ...baseContext,
          localContext: localResponse?.context ?? null,
        });
        if (!aiRequest) {
          return;
        }

        const aiResponse = await requestGhostCompletion(aiRequest);
        if (generationRef.current !== generation) {
          return;
        }

        const merged = mergeCompletionCandidates({
          local: localCandidates.filter((candidate) => candidate.source === "local"),
          ai: aiResponse?.suggestions ?? [],
          system: localCandidates.filter((candidate) => candidate.source === "system"),
        });
        setCandidates(merged);
      };

      void run().catch(() => {
        if (generationRef.current !== generation) {
          return;
        }

        setCandidates([]);
      });
    }, COMPLETION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    aiConfig.apiKey,
    aiConfig.enabled,
    aiConfig.model,
    aiConfig.provider,
    browsingHistory,
    cursorAtEnd,
    disabled,
    draft,
    isComposing,
    isFocused,
    paneState.composerHistory,
    paneState.cwd,
    paneState.mode,
    paneState.shell,
    status,
  ]);

  const suggestion = buildGhostSuffix(draft, candidates);

  return {
    suggestion,
    candidates,
    clearSuggestion() {
      generationRef.current += 1;
      setCandidates([]);
    },
    acceptSuggestion(index = 0) {
      const candidate = candidates[index];
      if (candidate) {
        generationRef.current += 1;
        setCandidates([]);
        return candidate.text;
      }

      if (!suggestion) {
        return null;
      }

      generationRef.current += 1;
      setCandidates([]);
      return applyGhostCompletion(draft, suggestion);
    },
  };
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") {
    return crypto.randomUUID();
  }

  const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (stored) {
    return stored;
  }

  const nextId = crypto.randomUUID();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, nextId);
  return nextId;
}
