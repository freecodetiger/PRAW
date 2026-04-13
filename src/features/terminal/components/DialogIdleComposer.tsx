import { useEffect, useMemo, useRef, useState } from "react";

import { buildCandidateSuffix } from "../../../domain/completion/candidates";
import { getNextPhraseSelection, getPhraseMatches } from "../../../domain/terminal/phrase-completion";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useGhostCompletion } from "../hooks/useGhostCompletion";
import type { TerminalTabViewState } from "../state/terminal-view-store";

interface DialogIdleComposerProps {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  isActive: boolean;
  onSubmitCommand: (command: string) => void;
}

export function DialogIdleComposer({
  paneState,
  status,
  isActive,
  onSubmitCommand,
}: DialogIdleComposerProps) {
  const terminalConfig = useAppConfigStore((state) => state.config.terminal);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const [draft, setDraft] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorAtEnd, setCursorAtEnd] = useState(true);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [completionIndex, setCompletionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const history = paneState.composerHistory;

  const phraseCompletionEnabled =
    status === "running" && historyIndex === null && isFocused && cursorAtEnd && !isComposing;

  const phraseMatches = useMemo(
    () =>
      phraseCompletionEnabled
        ? getPhraseMatches(draft, terminalConfig.phrases, terminalConfig.phraseUsage)
        : [],
    [draft, phraseCompletionEnabled, terminalConfig.phraseUsage, terminalConfig.phrases],
  );
  const activePhrase = phraseMatches[phraseIndex] ?? null;

  const {
    suggestion: fallbackSuggestion,
    candidates,
    acceptSuggestion,
    clearSuggestion,
  } = useGhostCompletion({
    paneState,
    status,
    draft,
    cursorAtEnd,
    browsingHistory: historyIndex !== null,
    isComposing,
    isFocused,
    disabled: phraseMatches.length > 0,
  });

  const activeCandidate = candidates[completionIndex] ?? null;
  const asyncSuggestion = buildCandidateSuffix(draft, activeCandidate) || fallbackSuggestion;
  const suggestion = activePhrase?.suffix ?? asyncSuggestion;
  const showCandidateMenu =
    phraseMatches.length === 0 && candidates.length > 0 && isFocused && cursorAtEnd && !isComposing && historyIndex === null;
  const isDisabled = status !== "running";

  useEffect(() => {
    if (!isActive) {
      return;
    }

    inputRef.current?.focus();
  }, [isActive]);

  useEffect(() => {
    setPhraseIndex(0);
  }, [draft, terminalConfig.phrases, terminalConfig.phraseUsage]);

  useEffect(() => {
    setCompletionIndex(0);
  }, [draft, candidates]);

  const syncCursorState = (input: HTMLInputElement) => {
    const end = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    setCursorAtEnd(end);
  };

  const acceptAsyncCandidate = (index = completionIndex) => {
    const nextDraft = acceptSuggestion(index);
    if (!nextDraft) {
      return;
    }

    setDraft(nextDraft);
    setHistoryIndex(null);
    setCursorAtEnd(true);
    setCompletionIndex(0);
  };

  const submit = () => {
    const command = draft.trim();
    if (!command || isDisabled) {
      return;
    }

    clearSuggestion();
    onSubmitCommand(command);
    setDraft("");
    setHistoryIndex(null);
    setHistoryDraft("");
    setCursorAtEnd(true);
    setPhraseIndex(0);
    setCompletionIndex(0);
  };

  return (
    <div className="dialog-terminal__composer" onMouseDown={() => inputRef.current?.focus()}>
      <span className="dialog-terminal__prompt">{paneState.cwd} $</span>
      <div className="dialog-terminal__input-column">
        <div className="dialog-terminal__input-shell">
          {suggestion ? (
            <div className="dialog-terminal__ghost" aria-hidden="true">
              <span className="dialog-terminal__ghost-prefix">{draft}</span>
              <span className="dialog-terminal__ghost-suffix">{suggestion}</span>
            </div>
          ) : null}
          <input
            ref={inputRef}
            className="dialog-terminal__input"
            disabled={isDisabled}
            placeholder={status !== "running" ? "Session is not accepting input." : "Run a command"}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              syncCursorState(event.target);
              if (historyIndex !== null) {
                setHistoryIndex(null);
              }
            }}
            onFocus={(event) => {
              setIsFocused(true);
              syncCursorState(event.target);
            }}
            onBlur={() => {
              setIsFocused(false);
              clearSuggestion();
            }}
            onClick={(event) => syncCursorState(event.currentTarget)}
            onKeyUp={(event) => syncCursorState(event.currentTarget)}
            onSelect={(event) => syncCursorState(event.currentTarget)}
            onCompositionStart={() => {
              setIsComposing(true);
              clearSuggestion();
            }}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              syncCursorState(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === "ArrowUp" && phraseMatches.length > 1) {
                event.preventDefault();
                clearSuggestion();
                setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "previous"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowDown" && phraseMatches.length > 1) {
                event.preventDefault();
                clearSuggestion();
                setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "next"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowUp" && candidates.length > 1) {
                event.preventDefault();
                setCompletionIndex((index) => getNextPhraseSelection(index, candidates.length, "previous"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowDown" && candidates.length > 1) {
                event.preventDefault();
                setCompletionIndex((index) => getNextPhraseSelection(index, candidates.length, "next"));
                return;
              }

              if (event.key === "Tab" && activePhrase && !isComposing) {
                event.preventDefault();
                const nextDraft = draft + activePhrase.suffix;
                const nextUsageScore = Math.max(0, ...Object.values(terminalConfig.phraseUsage)) + 1;

                patchTerminalConfig({
                  phraseUsage: {
                    ...terminalConfig.phraseUsage,
                    [activePhrase.phrase]: nextUsageScore,
                  },
                });

                setDraft(nextDraft);
                setHistoryIndex(null);
                setCursorAtEnd(true);
                setPhraseIndex(0);
                return;
              }

              if (event.key === "Tab" && suggestion && !isComposing) {
                event.preventDefault();
                acceptAsyncCandidate();
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                submit();
                return;
              }

              if (event.key === "ArrowUp") {
                if (history.length === 0) {
                  return;
                }

                event.preventDefault();
                clearSuggestion();
                if (historyIndex === null) {
                  setHistoryDraft(draft);
                  setHistoryIndex(history.length - 1);
                  setDraft(history[history.length - 1] ?? "");
                  setCursorAtEnd(true);
                  return;
                }

                const nextIndex = Math.max(0, historyIndex - 1);
                setHistoryIndex(nextIndex);
                setDraft(history[nextIndex] ?? "");
                setCursorAtEnd(true);
                return;
              }

              if (event.key === "ArrowDown" && historyIndex !== null) {
                event.preventDefault();
                clearSuggestion();
                if (historyIndex >= history.length - 1) {
                  setHistoryIndex(null);
                  setDraft(historyDraft);
                  setCursorAtEnd(true);
                  return;
                }

                const nextIndex = historyIndex + 1;
                setHistoryIndex(nextIndex);
                setDraft(history[nextIndex] ?? "");
                setCursorAtEnd(true);
              }
            }}
          />
        </div>

        {showCandidateMenu ? (
          <div className="dialog-terminal__candidate-menu" role="listbox" aria-label="Completion candidates">
            {candidates.map((candidate, index) => (
              <button
                key={`${candidate.source}:${candidate.kind}:${candidate.text}`}
                className={`dialog-terminal__candidate${index === completionIndex ? " dialog-terminal__candidate--active" : ""}`}
                type="button"
                role="option"
                aria-selected={index === completionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptAsyncCandidate(index)}
              >
                <span className="dialog-terminal__candidate-text">{candidate.text}</span>
                <span className="dialog-terminal__candidate-meta">
                  {candidate.source} · {candidate.kind}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
