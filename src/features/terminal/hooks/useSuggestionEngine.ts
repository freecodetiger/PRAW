import { useEffect, useMemo, useRef, useState } from "react";

import type { CompletionContextSnapshot } from "../../../domain/ai/types";
import { classifyCompletionInput } from "../../../domain/suggestion/input-mode";
import { applySuggestion } from "../../../domain/suggestion/items";
import { buildSuggestionSessionPresentation } from "../../../domain/suggestion/orchestrator";
import { buildSuggestionPresentationModel } from "../../../domain/suggestion/ranker";
import {
  createEmptySessionCompletionContext,
  recordAcceptedSuggestion,
  recordCompletedCommand,
  recordRejectedAiSuggestions,
} from "../../../domain/suggestion/session-memory";
import type {
  AiSuggestionCommandResult,
  AiSuggestionStatus,
  CompletionInputMode,
  ProjectProfile,
  SessionCompletionContext,
  SuggestionGroup,
  SuggestionItem,
  SuggestionSourceResult,
  SuggestionResponse,
} from "../../../domain/suggestion/types";
import { deriveWorkflowSuggestions } from "../../../domain/suggestion/workflow";
import { requestAiInlineSuggestions, requestAiIntentSuggestions, requestAiRecoverySuggestions } from "../../../lib/tauri/ai";
import {
  recordCompletionCommandExecution,
  recordCompletionSuggestionAcceptance,
  requestLocalCompletion,
} from "../../../lib/tauri/completion";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { runAiIntentSource } from "../lib/suggestion-sources";
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
const reportedCompletedCommandKeys = new Set<string>();

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
  aiStatus: AiSuggestionStatus;
  inputMode: CompletionInputMode;
  requestIntentSuggestions: () => void;
  acceptGhostSuggestion: () => string | null;
  acceptSuggestion: (index?: number) => string | null;
  dismissSuggestions: () => void;
}

const IDLE_AI_STATUS: AiSuggestionStatus = { state: "idle" };
type SessionFeedbackState = Pick<SessionCompletionContext, "acceptedSuggestions" | "rejectedAiSuggestions">;

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
  const [inlineSourceResults, setInlineSourceResults] = useState<SuggestionSourceResult[]>([]);
  const [intentSourceResults, setIntentSourceResults] = useState<SuggestionSourceResult[]>([]);
  const [recoverySourceResults, setRecoverySourceResults] = useState<SuggestionSourceResult[]>([]);
  const [inlineAiStatus, setInlineAiStatus] = useState<AiSuggestionStatus>(IDLE_AI_STATUS);
  const [intentAiStatus, setIntentAiStatus] = useState<AiSuggestionStatus>(IDLE_AI_STATUS);
  const [recoveryAiStatus, setRecoveryAiStatus] = useState<AiSuggestionStatus>(IDLE_AI_STATUS);
  const [intentRequested, setIntentRequested] = useState(false);
  const [dismissedRecoveryBlockId, setDismissedRecoveryBlockId] = useState<string | null>(null);
  const [localContextSnapshot, setLocalContextSnapshot] = useState<CompletionContextSnapshot | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<SessionFeedbackState>({
    acceptedSuggestions: [],
    rejectedAiSuggestions: [],
  });
  const inlineGenerationRef = useRef(0);
  const intentGenerationRef = useRef(0);
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
      baseUrl: aiConfig.baseUrl,
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
      aiConfig.baseUrl,
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
  const inputMode = useMemo(() => classifyCompletionInput(draft, paneState.shell), [draft, paneState.shell]);
  const sessionContext = useMemo(
    () => buildSessionCompletionContext(paneState, localContextSnapshot, sessionFeedback),
    [localContextSnapshot, paneState, sessionFeedback],
  );
  const inlinePresentation = useMemo(() => {
    const workflowSuggestions = deriveWorkflowSuggestions({
      draft,
      recentCommands: paneState.composerHistory,
      blocks: paneState.blocks,
      localContext: localContextSnapshot,
    });
    const inlineSuggestions = inlineSourceResults.flatMap((result) => result.suggestions);

    return buildSuggestionPresentationModel({
      draft,
      recentCommands: paneState.composerHistory,
      blocks: paneState.blocks,
      localContext: localContextSnapshot,
      sessionContext,
      suggestions: [...inlineSuggestions, ...workflowSuggestions],
    });
  }, [draft, inlineSourceResults, localContextSnapshot, paneState.blocks, paneState.composerHistory, sessionContext]);
  const intentSession = useMemo(
    () =>
      buildSuggestionSessionPresentation({
        draft,
        inputMode,
        trigger: intentRequested ? "tab" : "automatic",
        generation: intentGenerationRef.current,
        sourceResults: intentSourceResults,
        context: sessionContext,
      }),
    [draft, inputMode, intentRequested, intentSourceResults, sessionContext],
  );
  const recoverySession = useMemo(
    () =>
      buildSuggestionSessionPresentation({
        draft,
        inputMode: "recovery",
        trigger: "automatic",
        generation: recoveryGenerationRef.current,
        sourceResults: recoverySourceResults,
        context: sessionContext,
      }),
    [draft, recoverySourceResults, sessionContext],
  );

  useEffect(() => {
    if (failedBlock?.id !== dismissedRecoveryBlockId) {
      setDismissedRecoveryBlockId((current) => (current === null || current === failedBlock?.id ? current : null));
    }
  }, [dismissedRecoveryBlockId, failedBlock?.id]);

  useEffect(() => {
    setLocalContextSnapshot(null);
  }, [blockVersionKey, historyVersionKey, paneState.cwd, paneState.shell]);

  useEffect(() => {
    for (const block of paneState.blocks) {
      if (block.kind !== "command" || block.status !== "completed" || !block.command) {
        continue;
      }

      const reportKey = `${paneState.shell}|${block.id}|${block.cwd}|${block.command}|${block.exitCode ?? ""}`;
      if (reportedCompletedCommandKeys.has(reportKey)) {
        continue;
      }

      reportedCompletedCommandKeys.add(reportKey);
      void recordCompletionCommandExecution({
        commandText: block.command,
        cwd: block.cwd,
        shell: paneState.shell,
        exitCode: block.exitCode,
        executedAt: Date.now(),
      });
    }
  }, [paneState.blocks, paneState.shell]);

  useEffect(() => {
    setIntentSourceResults([]);
    setIntentAiStatus(IDLE_AI_STATUS);
    setIntentRequested(false);
    intentGenerationRef.current += 1;
  }, [draft]);

  useEffect(() => {
    const generation = inlineGenerationRef.current + 1;
    inlineGenerationRef.current = generation;
    setInlineSourceResults([]);
    setInlineAiStatus(IDLE_AI_STATUS);

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
        setInlineSourceResults([
          {
            sourceId: "local",
            generation,
            state: localSuggestions.length > 0 ? "success" : "empty",
            suggestions: localSuggestions,
          },
        ]);

        const aiRequest = buildAiInlineSuggestionRequest({
          ...baseContext,
          localContext: localResponse?.context ?? null,
        });
        if (!aiRequest) {
          return;
        }

        setInlineAiStatus({ state: "loading" });
        setInlineSourceResults((current) =>
          upsertSourceResult(current, {
            sourceId: "ai-inline",
            generation,
            state: "loading",
            suggestions: [],
          }),
        );
        const aiResponse = await requestAiInlineSuggestions(aiRequest);
        if (inlineGenerationRef.current !== generation) {
          return;
        }

        const result = normalizeAiSuggestionCommandResult(aiResponse);
        const aiSuggestions = (result?.suggestions ?? []).filter((suggestion) => suggestion.group === "inline");
        setInlineAiStatus(resolveAiSuggestionStatus(result, aiSuggestions.length));
        setInlineSourceResults((current) =>
          upsertSourceResult(current, {
            sourceId: "ai-inline",
            generation,
            state: sourceStateFromAiResult(result, aiSuggestions.length),
            suggestions: aiSuggestions,
            message: result?.message,
          }),
        );
      };

      void run().catch(() => {
        if (inlineGenerationRef.current !== generation) {
          return;
        }

        setInlineSourceResults((current) =>
          upsertSourceResult(current, {
            sourceId: "ai-inline",
            generation,
            state: "error",
            suggestions: [],
            message: "network error",
          }),
        );
        setInlineAiStatus({
          state: "error",
          reason: "networkError",
        });
      });
    }, INLINE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [baseContext, blockVersionKey, draft, historyVersionKey]);

  useEffect(() => {
    const generation = recoveryGenerationRef.current + 1;
    recoveryGenerationRef.current = generation;
    setRecoverySourceResults([]);
    setRecoveryAiStatus(IDLE_AI_STATUS);

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
        setRecoveryAiStatus({ state: "loading" });
        setRecoverySourceResults([
          {
            sourceId: "ai-recovery",
            generation,
            state: "loading",
            suggestions: [],
          },
        ]);
        const response = await requestAiRecoverySuggestions(request);
        if (recoveryGenerationRef.current !== generation) {
          return;
        }

        const result = normalizeAiSuggestionCommandResult(response);
        const suggestions = (result?.suggestions ?? []).filter((suggestion) => suggestion.group === "recovery");
        setRecoveryAiStatus(resolveAiSuggestionStatus(result, suggestions.length));
        setRecoverySourceResults([
          {
            sourceId: "ai-recovery",
            generation,
            state: sourceStateFromAiResult(result, suggestions.length),
            suggestions,
            message: result?.message,
          },
        ]);
      };

      void run().catch(() => {
        if (recoveryGenerationRef.current !== generation) {
          return;
        }

        setRecoverySourceResults([
          {
            sourceId: "ai-recovery",
            generation,
            state: "error",
            suggestions: [],
            message: "network error",
          },
        ]);
        setRecoveryAiStatus({
          state: "error",
          reason: "networkError",
        });
      });
    }, RECOVERY_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [baseContext, dismissedRecoveryBlockId, failedBlock]);

  const requestIntentSuggestions = () => {
    if (inputMode !== "intent") {
      return;
    }

    const generation = intentGenerationRef.current + 1;
    intentGenerationRef.current = generation;
    setIntentRequested(true);
    setIntentAiStatus({ state: "loading" });
    setIntentSourceResults([
      {
        sourceId: "ai-intent",
        generation,
        state: "loading",
        suggestions: [],
      },
    ]);

    void runAiIntentSource({
      draft,
      inputMode,
      trigger: "tab",
      generation,
      context: sessionContext,
      localCandidates: inlinePresentation.rankedSuggestions.map((suggestion) => suggestion.text),
      aiConfig: {
        enabled: aiConfig.enabled,
        provider: aiConfig.provider,
        model: aiConfig.model,
        apiKey: aiConfig.apiKey,
        baseUrl: aiConfig.baseUrl,
      },
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
      requestAiIntentSuggestions,
    })
      .then((result) => {
        if (intentGenerationRef.current !== generation) {
          return;
        }

        setIntentSourceResults([result]);
        setIntentAiStatus(sourceResultToAiStatus(result.state, result.suggestions.length, result.message));
      })
      .catch(() => {
        if (intentGenerationRef.current !== generation) {
          return;
        }

        setIntentSourceResults([
          {
            sourceId: "ai-intent",
            generation,
            state: "error",
            suggestions: [],
            message: "network error",
          },
        ]);
        setIntentAiStatus({
          state: "error",
          reason: "networkError",
        });
      });
  };

  const activeGroup: SuggestionGroup | null =
    draft.trim().length === 0 && recoverySession.activeGroup === "recovery"
      ? "recovery"
      : intentSession.activeGroup === "intent"
        ? "intent"
      : inlinePresentation.rankedSuggestions.length > 0
        ? "inline"
        : null;
  const visibleSuggestions =
    activeGroup === "recovery"
      ? recoverySession.suggestions
      : activeGroup === "intent"
        ? intentSession.suggestions
      : activeGroup === "inline"
        ? inlinePresentation.rankedSuggestions
        : [];
  const ghostSuggestion = activeGroup === "inline" ? inlinePresentation.ghostSuggestion : null;
  const aiStatus =
    activeGroup === "recovery"
      ? recoveryAiStatus
      : activeGroup === "intent"
        ? intentAiStatus
      : activeGroup === "inline"
        ? inlineAiStatus
        : IDLE_AI_STATUS;

  return {
    ghostSuggestion,
    visibleSuggestions,
    activeGroup,
    aiStatus,
    inputMode,
    requestIntentSuggestions,
    acceptGhostSuggestion() {
      if (!ghostSuggestion) {
        return null;
      }

      setSessionFeedback((current) =>
        applyFeedbackSelection(current, paneState, draft, ghostSuggestion, visibleSuggestions),
      );
      void recordCompletionSuggestionAcceptance({
        draft,
        acceptedText: ghostSuggestion.text,
        cwd: paneState.cwd,
        acceptedAt: Date.now(),
      });
      inlineGenerationRef.current += 1;
      intentGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSourceResults([]);
      setIntentSourceResults([]);
      setRecoverySourceResults([]);
      setInlineAiStatus(IDLE_AI_STATUS);
      setIntentAiStatus(IDLE_AI_STATUS);
      setRecoveryAiStatus(IDLE_AI_STATUS);
      setIntentRequested(false);
      return applySuggestion(draft, ghostSuggestion);
    },
    acceptSuggestion(index = 0) {
      const suggestion = visibleSuggestions[index] ?? ghostSuggestion;
      if (!suggestion) {
        return null;
      }

      setSessionFeedback((current) =>
        applyFeedbackSelection(current, paneState, draft, suggestion, visibleSuggestions),
      );
      void recordCompletionSuggestionAcceptance({
        draft,
        acceptedText: suggestion.text,
        cwd: paneState.cwd,
        acceptedAt: Date.now(),
      });
      inlineGenerationRef.current += 1;
      intentGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSourceResults([]);
      setIntentSourceResults([]);
      setRecoverySourceResults([]);
      setInlineAiStatus(IDLE_AI_STATUS);
      setIntentAiStatus(IDLE_AI_STATUS);
      setRecoveryAiStatus(IDLE_AI_STATUS);
      setIntentRequested(false);
      return applySuggestion(draft, suggestion);
    },
    dismissSuggestions() {
      setSessionFeedback((current) => applyRejectedFeedback(current, paneState, draft, visibleSuggestions));
      inlineGenerationRef.current += 1;
      intentGenerationRef.current += 1;
      recoveryGenerationRef.current += 1;
      setInlineSourceResults([]);
      setIntentSourceResults([]);
      setRecoverySourceResults([]);
      setInlineAiStatus(IDLE_AI_STATUS);
      setIntentAiStatus(IDLE_AI_STATUS);
      setRecoveryAiStatus(IDLE_AI_STATUS);
      setIntentRequested(false);

      if (activeGroup === "recovery" && failedBlock) {
        setDismissedRecoveryBlockId(failedBlock.id);
      }
    },
  };
}

function sourceResultToAiStatus(
  state: "idle" | "loading" | "success" | "empty" | "error" | "stale",
  count: number,
  message?: string,
): AiSuggestionStatus {
  if (state === "loading") {
    return { state: "loading" };
  }
  if (state === "success") {
    return count > 0 ? { state: "success", count } : { state: "empty" };
  }
  if (state === "empty" || state === "idle") {
    return state === "idle" ? IDLE_AI_STATUS : { state: "empty" };
  }
  return {
    state: "error",
    reason: "providerError",
    message,
  };
}

function sourceStateFromAiResult(
  result: AiSuggestionCommandResult | null,
  visibleSuggestionCount: number,
): SuggestionSourceResult["state"] {
  if (!result || result.status === "empty") {
    return "empty";
  }

  if (result.status === "success") {
    return visibleSuggestionCount > 0 ? "success" : "empty";
  }

  return "error";
}

function upsertSourceResult(
  current: SuggestionSourceResult[],
  next: SuggestionSourceResult,
): SuggestionSourceResult[] {
  return [...current.filter((result) => result.sourceId !== next.sourceId), next];
}

function buildSessionCompletionContext(
  paneState: TerminalTabViewState,
  localContext: CompletionContextSnapshot | null,
  feedback: SessionFeedbackState,
): SessionCompletionContext {
  let context = createEmptySessionCompletionContext("tab:active", paneState.cwd, paneState.shell);

  for (const [index, block] of paneState.blocks.entries()) {
    if (block.kind !== "command" || block.status !== "completed" || !block.command) {
      continue;
    }

    context = recordCompletedCommand(context, {
      command: block.command,
      cwd: block.cwd,
      exitCode: block.exitCode,
      output: block.output,
      completedAt: index,
    });
  }

  return {
    ...context,
    acceptedSuggestions: feedback.acceptedSuggestions,
    rejectedAiSuggestions: feedback.rejectedAiSuggestions,
    projectProfile: localContext ? projectProfileFromLocalContext(localContext) : context.projectProfile,
  };
}

function applyFeedbackSelection(
  feedback: SessionFeedbackState,
  paneState: TerminalTabViewState,
  draft: string,
  acceptedSuggestion: SuggestionItem,
  visibleSuggestions: SuggestionItem[],
): SessionFeedbackState {
  let context = createFeedbackContext(paneState, feedback);
  context = recordAcceptedSuggestion(context, {
    source: acceptedSuggestion.source,
    kind: acceptedSuggestion.kind,
    text: acceptedSuggestion.text,
    draft,
    cwd: paneState.cwd,
    acceptedAt: Date.now(),
  });

  const rejected = buildRejectedFeedback(paneState.cwd, draft, visibleSuggestions, acceptedSuggestion);
  if (rejected.length > 0) {
    context = recordRejectedAiSuggestions(context, rejected);
  }

  return {
    acceptedSuggestions: context.acceptedSuggestions,
    rejectedAiSuggestions: context.rejectedAiSuggestions,
  };
}

function applyRejectedFeedback(
  feedback: SessionFeedbackState,
  paneState: TerminalTabViewState,
  draft: string,
  visibleSuggestions: SuggestionItem[],
): SessionFeedbackState {
  const rejected = buildRejectedFeedback(paneState.cwd, draft, visibleSuggestions);
  if (rejected.length === 0) {
    return feedback;
  }

  const context = recordRejectedAiSuggestions(createFeedbackContext(paneState, feedback), rejected);
  return {
    acceptedSuggestions: context.acceptedSuggestions,
    rejectedAiSuggestions: context.rejectedAiSuggestions,
  };
}

function createFeedbackContext(
  paneState: TerminalTabViewState,
  feedback: SessionFeedbackState,
): SessionCompletionContext {
  return {
    ...createEmptySessionCompletionContext("tab:active", paneState.cwd, paneState.shell),
    acceptedSuggestions: feedback.acceptedSuggestions,
    rejectedAiSuggestions: feedback.rejectedAiSuggestions,
  };
}

function buildRejectedFeedback(
  cwd: string,
  draft: string,
  suggestions: SuggestionItem[],
  acceptedSuggestion?: SuggestionItem,
): SessionCompletionContext["rejectedAiSuggestions"] {
  return suggestions
    .filter((suggestion) => suggestion.source === "ai")
    .filter((suggestion) => suggestion.id !== acceptedSuggestion?.id)
    .map((suggestion) => ({
      source: suggestion.source,
      kind: suggestion.kind,
      text: suggestion.text,
      draft,
      cwd,
      rejectedAt: Date.now(),
    }));
}

function projectProfileFromLocalContext(localContext: CompletionContextSnapshot): ProjectProfile {
  return {
    type: inferProjectType(localContext),
    packageManager: localContext.systemSummary.packageManager,
    scripts: [],
    gitBranch: localContext.gitBranch ?? undefined,
    gitStatusSummary: localContext.gitStatusSummary,
    toolAvailability: localContext.toolAvailability,
  };
}

function inferProjectType(localContext: CompletionContextSnapshot): ProjectProfile["type"] {
  if (localContext.cwdSummary.files.includes("package.json")) {
    return "node";
  }
  if (localContext.cwdSummary.files.includes("Cargo.toml")) {
    return "rust";
  }
  if (localContext.cwdSummary.files.some((file) => file === "pyproject.toml" || file === "requirements.txt")) {
    return "python";
  }
  if (localContext.cwdSummary.files.includes("go.mod")) {
    return "go";
  }

  return "unknown";
}

function normalizeAiSuggestionCommandResult(
  response: AiSuggestionCommandResult | SuggestionResponse | null,
): AiSuggestionCommandResult | null {
  if (!response) {
    return null;
  }

  if ("status" in response) {
    return response;
  }

  return {
    status: response.suggestions.length > 0 ? "success" : "empty",
    suggestions: response.suggestions,
    latencyMs: response.latencyMs,
  };
}

function resolveAiSuggestionStatus(
  result: AiSuggestionCommandResult | null,
  visibleSuggestionCount: number,
): AiSuggestionStatus {
  if (!result) {
    return { state: "empty" };
  }

  if (result.status === "success") {
    return visibleSuggestionCount > 0
      ? {
          state: "success",
          latencyMs: result.latencyMs,
          count: visibleSuggestionCount,
        }
      : {
          state: "empty",
          latencyMs: result.latencyMs,
        };
  }

  if (result.status === "empty") {
    return {
      state: "empty",
      latencyMs: result.latencyMs,
    };
  }

  if (result.status === "timeout") {
    return {
      state: "timeout",
      message: result.message,
    };
  }

  return {
    state: "error",
    reason: result.status,
    message: result.message,
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
