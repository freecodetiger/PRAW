import { useEffect, useMemo, useRef, useState } from "react";

import type { CompletionContextSnapshot } from "../../../domain/ai/types";
import { applySuggestion, mergeSuggestionItems } from "../../../domain/suggestion/items";
import { buildSuggestionPresentationModel } from "../../../domain/suggestion/ranker";
import type { SuggestionGroup, SuggestionItem } from "../../../domain/suggestion/types";
import { deriveWorkflowSuggestions } from "../../../domain/suggestion/workflow";
import { requestAiInlineSuggestions, requestAiRecoverySuggestions } from "../../../lib/tauri/ai";
import { requestLocalCompletion } from "../../../lib/tauri/completion";
import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  buildAiInlineSuggestionRequest,
  buildLocalCompletionRequest,
  buildRecoverySuggestionRequest,
  buildSuggestionFromLocalCandidate,
  findMostRecentFailedCommandBlock,
  shouldRequestLocalInlineSuggestions,
  shouldRequestRecoverySuggestions,
  type SuggestionEngineContext,
} from "../lib/suggestion-engine";
import type { TerminalTabViewState } from "../state/terminal-view-store";

const INLINE_SUGGESTION_DEBOUNCE_MS = 180;
const RECOVERY_SUGGESTION_DEBOUNCE_MS = 120;
const USER_ID_STORAGE_KEY = "praw-completion-user-id";

interface UseSuggestionEngineOptions {
  paneState: TerminalTabViewState;
  status: SuggestionEngineContext["status"];
  draft: string;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
  disabled?: boolean;
}

interface SuggestionEngineState {
  ghostSuggestion: SuggestionItem | null;
  visibleSuggestions: SuggestionItem[];
  activeGroup: SuggestionGroup | null;
  acceptGhostSuggestion: () => string | null;
  acceptSuggestion: (index?: number) => string | null;
  dismissSuggestions: () => void;
}

export function useSuggestionEngine({
  paneState,
  status,
  draft,
  cursorAtEnd,
  browsingHistory,
  isComposing,
  isFocused,
  disabled = false,
}: UseSuggestionEngineOptions): SuggestionEngineState {
  const aiConfig = useAppConfigStore((state) => state.config.ai);
  const [inlineSuggestions, setInlineSuggestions] = useState<SuggestionItem[]>([]);
  const [recoverySuggestions, setRecoverySuggestions] = useState<SuggestionItem[]>([]);
  const [dismissedRecoveryBlockId, setDismissedRecoveryBlockId] = useState<string | null>(null);
  const [localContextSnapshot, setLocalContextSnapshot] = useState<CompletionContextSnapshot | null>(null);
  const inlineGenerationRef = useRef(0);
  const recoveryGenerationRef = useRef(0);
  const sessionIdRef = useRef(crypto.randomUUID());
  const userIdRef = useRef(getOrCreateUserId());
  const blockVersionKey = useMemo(
    () =>
      paneState.blocks
        .map((block) => `${block.id}:${block.status}:${block.exitCode ?? ""}:${block.command ?? ""}`)
        .join("|"),
    [paneState.blocks],
  );
  const historyVersionKey = useMemo(() => paneState.composerHistory.join("\u0000"), [paneState.composerHistory]);

  const baseContext = useMemo<SuggestionEngineContext>(
    () => ({
      aiEnabled: aiConfig.enabled,
      apiKey: aiConfig.apiKey,
      provider: aiConfig.provider as SuggestionEngineContext["provider"],
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
      suppressInlineSuggestions: disabled,
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
      localContext: null,
    }),
    [
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
    ],
  );

  const failedBlock = useMemo(() => findMostRecentFailedCommandBlock(paneState.blocks), [paneState.blocks]);
  const inlinePresentation = useMemo(() => {
    const workflowSuggestions = deriveWorkflowSuggestions({
      draft,
      recentCommands: paneState.composerHistory,
      blocks: paneState.blocks,
      localContext: localContextSnapshot,
    });

    return buildSuggestionPresentationModel({
      draft,
      recentCommands: paneState.composerHistory,
      blocks: paneState.blocks,
      localContext: localContextSnapshot,
      suggestions: [...inlineSuggestions, ...workflowSuggestions],
    });
  }, [draft, inlineSuggestions, localContextSnapshot, paneState.blocks, paneState.composerHistory]);

  useEffect(() => {
    if (failedBlock?.id !== dismissedRecoveryBlockId) {
      setDismissedRecoveryBlockId((current) => (current === null || current === failedBlock?.id ? current : null));
    }
  }, [dismissedRecoveryBlockId, failedBlock?.id]);

  useEffect(() => {
    setLocalContextSnapshot(null);
  }, [blockVersionKey, historyVersionKey, paneState.cwd, paneState.shell]);

  useEffect(() => {
    const generation = inlineGenerationRef.current + 1;
    inlineGenerationRef.current = generation;
    setInlineSuggestions([]);

    const localRequest = buildLocalCompletionRequest(baseContext);
    if (!localRequest) {
      return;
    }

    const timer = window.setTimeout(() => {
      const run = async () => {
        const localResponse = await requestLocalCompletion(localRequest);
        if (inlineGenerationRef.current !== generation) {
          return;
        }

        if (localResponse?.context) {
          setLocalContextSnapshot(localResponse.context);
        }

        const localSuggestions = shouldRequestLocalInlineSuggestions(baseContext)
          ? (localResponse?.suggestions ?? [])
              .map((candidate) => buildSuggestionFromLocalCandidate(draft, candidate))
              .filter(
                (suggestion) => suggestion.replacement.type !== "append" || suggestion.replacement.suffix.length > 0,
              )
          : [];
        setInlineSuggestions(mergeSuggestionItems(localSuggestions));

        const aiRequest = buildAiInlineSuggestionRequest({
          ...baseContext,
          localContext: localResponse?.context ?? null,
        });
        if (!aiRequest) {
          return;
        }

        const aiResponse = await requestAiInlineSuggestions(aiRequest);
        if (inlineGenerationRef.current !== generation) {
          return;
        }

        setInlineSuggestions(
          mergeSuggestionItems([
            ...localSuggestions,
            ...(aiResponse?.suggestions ?? []).filter((suggestion) => suggestion.group === "inline"),
          ]),
        );
      };

      void run().catch(() => {
        if (inlineGenerationRef.current !== generation) {
          return;
        }

        setInlineSuggestions([]);
      });
    }, INLINE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [baseContext, blockVersionKey, draft, historyVersionKey]);

  useEffect(() => {
    const generation = recoveryGenerationRef.current + 1;
    recoveryGenerationRef.current = generation;
    setRecoverySuggestions([]);

    if (failedBlock?.id === dismissedRecoveryBlockId) {
      return;
    }

    if (!shouldRequestRecoverySuggestions(baseContext, failedBlock)) {
      return;
    }

    const request = buildRecoverySuggestionRequest(baseContext, failedBlock);
    if (!request) {
      return;
    }

    const timer = window.setTimeout(() => {
      const run = async () => {
        const response = await requestAiRecoverySuggestions(request);
        if (recoveryGenerationRef.current !== generation) {
          return;
        }

        setRecoverySuggestions(mergeSuggestionItems((response?.suggestions ?? []).filter((suggestion) => suggestion.group === "recovery")));
      };

      void run().catch(() => {
        if (recoveryGenerationRef.current !== generation) {
          return;
        }

        setRecoverySuggestions([]);
      });
    }, RECOVERY_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [baseContext, dismissedRecoveryBlockId, failedBlock]);

  const activeGroup: SuggestionGroup | null =
    draft.trim().length === 0 && recoverySuggestions.length > 0
      ? "recovery"
      : inlinePresentation.rankedSuggestions.length > 0
        ? "inline"
        : null;
  const visibleSuggestions =
    activeGroup === "recovery"
      ? recoverySuggestions
      : activeGroup === "inline"
        ? inlinePresentation.rankedSuggestions
        : [];
  const ghostSuggestion = activeGroup === "inline" ? inlinePresentation.ghostSuggestion : null;

  return {
    ghostSuggestion,
    visibleSuggestions,
    activeGroup,
    acceptGhostSuggestion() {
      if (!ghostSuggestion) {
        return null;
      }

      inlineGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSuggestions([]);
      setRecoverySuggestions([]);
      return applySuggestion(draft, ghostSuggestion);
    },
    acceptSuggestion(index = 0) {
      const suggestion = visibleSuggestions[index] ?? ghostSuggestion;
      if (!suggestion) {
        return null;
      }

      inlineGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSuggestions([]);
      setRecoverySuggestions([]);
      return applySuggestion(draft, suggestion);
    },
    dismissSuggestions() {
      inlineGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSuggestions([]);
      setRecoverySuggestions([]);

      if (activeGroup === "recovery" && failedBlock) {
        setDismissedRecoveryBlockId(failedBlock.id);
      }
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
