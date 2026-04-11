import { useEffect, useRef, useState } from "react";

import type { CompletionRequest } from "../../../domain/ai/types";
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

interface UseGhostCompletionOptions {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  draft: string;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
}

interface GhostCompletionState {
  suggestion: string;
  clearSuggestion: () => void;
  acceptSuggestion: () => string | null;
}

export function useGhostCompletion({
  paneState,
  status,
  draft,
  cursorAtEnd,
  browsingHistory,
  isComposing,
  isFocused,
}: UseGhostCompletionOptions): GhostCompletionState {
  const aiConfig = useAppConfigStore((state) => state.config.ai);
  const [suggestion, setSuggestion] = useState("");
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSuggestion("");

    const localRequest = buildLocalCompletionRequest({
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
    });
    const aiRequest = buildGhostCompletionRequest({
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
    });

    if (!localRequest && !aiRequest) {
      return;
    }

    const timer = window.setTimeout(() => {
      const run = async () => {
        if (localRequest) {
          const localResponse = await requestLocalCompletion(localRequest);
          if (generationRef.current !== generation) {
            return;
          }

          if (localResponse?.suggestion) {
            setSuggestion(localResponse.suggestion);
            return;
          }
        }

        if (!aiRequest) {
          setSuggestion("");
          return;
        }

        const aiResponse = await requestGhostCompletion(aiRequest);
        if (generationRef.current !== generation) {
          return;
        }

        setSuggestion(aiResponse?.suggestion ?? "");
      };

      void run().catch(() => {
        if (generationRef.current !== generation) {
          return;
        }

        setSuggestion("");
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
    draft,
    isComposing,
    isFocused,
    paneState.composerHistory,
    paneState.cwd,
    paneState.mode,
    paneState.shell,
    status,
  ]);

  return {
    suggestion,
    clearSuggestion() {
      generationRef.current += 1;
      setSuggestion("");
    },
    acceptSuggestion() {
      if (!suggestion) {
        return null;
      }

      generationRef.current += 1;
      setSuggestion("");
      return applyGhostCompletion(draft, suggestion);
    },
  };
}
