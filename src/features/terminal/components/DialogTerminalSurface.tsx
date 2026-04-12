import { useEffect, useMemo, useRef, useState } from "react";

import { buildCandidateSuffix } from "../../../domain/completion/candidates";
import type { CommandBlock } from "../../../domain/terminal/dialog";
import { getNextPhraseSelection, getPhraseMatches } from "../../../domain/terminal/phrase-completion";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useGhostCompletion } from "../hooks/useGhostCompletion";
import { resolveDialogPtyKeyInput } from "../lib/dialog-pty-input";
import { tokenizeDialogOutput, type DialogOutputToken } from "../lib/dialog-output";
import { highlightCommandText, type HistoryHighlightToken } from "../lib/history-highlighting";
import { resolvePinnedBottomState } from "../lib/scroll-pinning";
import type { TerminalTabViewState } from "../state/terminal-view-store";

interface DialogTerminalSurfaceProps {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  onSubmitCommand: (command: string) => void;
  onWriteInput: (data: string) => void;
  isActive: boolean;
}

export function DialogTerminalSurface({
  paneState,
  status,
  onSubmitCommand,
  onWriteInput,
  isActive,
}: DialogTerminalSurfaceProps) {
  const terminalConfig = useAppConfigStore((state) => state.config.terminal);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const [draft, setDraft] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const [isPinnedBottom, setIsPinnedBottom] = useState(true);
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorAtEnd, setCursorAtEnd] = useState(true);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [ptyDraft, setPtyDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ptyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const ptyComposingRef = useRef(false);
  const manualJumpPendingRef = useRef(false);
  const history = paneState.composerHistory;
  const hasActiveCommand = paneState.activeCommandBlockId !== null;
  const isCommandComposer = paneState.mode === "dialog" && paneState.composerMode === "command";
  const isPtyComposer = paneState.mode === "dialog" && paneState.composerMode === "pty" && hasActiveCommand;
  const activeCommand =
    hasActiveCommand ? paneState.blocks.find((block) => block.id === paneState.activeCommandBlockId) ?? null : null;

  const phraseCompletionEnabled =
    status === "running" &&
    isCommandComposer &&
    historyIndex === null &&
    isFocused &&
    cursorAtEnd &&
    !isComposing;

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
    disabled: phraseMatches.length > 0 || !isCommandComposer,
  });

  const activeCandidate = candidates[completionIndex] ?? null;
  const asyncSuggestion = buildCandidateSuffix(draft, activeCandidate) || fallbackSuggestion;
  const suggestion = activePhrase?.suffix ?? asyncSuggestion;
  const showCandidateMenu =
    phraseMatches.length === 0 &&
    candidates.length > 0 &&
    isCommandComposer &&
    isFocused &&
    cursorAtEnd &&
    !isComposing &&
    historyIndex === null;

  useEffect(() => {
    if (isActive) {
      if (isPtyComposer) {
        ptyInputRef.current?.focus();
        return;
      }

      inputRef.current?.focus();
    }
  }, [isActive, isPtyComposer, paneState.mode]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !isPinnedBottom) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [isPinnedBottom, paneState.blocks]);

  useEffect(() => {
    setPhraseIndex(0);
  }, [draft, terminalConfig.phrases, terminalConfig.phraseUsage]);

  useEffect(() => {
    setCompletionIndex(0);
  }, [draft, candidates]);

  useEffect(() => {
    if (!isPtyComposer) {
      setPtyDraft("");
      ptyComposingRef.current = false;
    }
  }, [isPtyComposer]);

  const isDisabled = status !== "running" || !isCommandComposer;

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

  const focusComposer = () => {
    if (isPtyComposer) {
      ptyInputRef.current?.focus();
      return;
    }

    inputRef.current?.focus();
  };

  const writePtyInput = (data: string) => {
    if (!data || status !== "running") {
      return;
    }

    onWriteInput(data);
  };

  return (
    <div className="dialog-terminal" onMouseDown={focusComposer}>
      <div
        className="dialog-terminal__history"
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
          const nextPinned = resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current);
          manualJumpPendingRef.current = false;
          setIsPinnedBottom(nextPinned);
        }}
      >
        {paneState.blocks.map((block: CommandBlock, index: number) => (
          <article className="command-block" key={block.id}>
            {index > 0 ? <hr className="command-block__divider" /> : null}
            {block.kind === "command" ? (
              <CommandTranscriptHeader block={block} />
            ) : (
              <p className="command-block__session-label">session output</p>
            )}
            <CommandBlockOutput output={block.output || (block.status === "running" ? "" : " ")} />
            {block.kind === "command" && block.status === "completed" ? (
              <p className="command-block__status">exit {block.exitCode ?? "unknown"}</p>
            ) : null}
          </article>
        ))}
      </div>

      {!isPinnedBottom ? (
        <div className="dialog-terminal__jump">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              const node = scrollRef.current;
              if (!node) {
                return;
              }

              manualJumpPendingRef.current = true;
              node.scrollTop = node.scrollHeight;
              setIsPinnedBottom(true);
            }}
          >
            Jump to latest
          </button>
        </div>
      ) : null}

      <div className="dialog-terminal__composer">
        <span className="dialog-terminal__prompt">{isPtyComposer ? "stdin" : `${paneState.cwd} $`}</span>
        <div className="dialog-terminal__input-column">
          <div className="dialog-terminal__input-shell">
            {isCommandComposer && suggestion ? (
              <div className="dialog-terminal__ghost" aria-hidden="true">
                <span className="dialog-terminal__ghost-prefix">{draft}</span>
                <span className="dialog-terminal__ghost-suffix">{suggestion}</span>
              </div>
            ) : null}
            {isPtyComposer ? (
              <textarea
                ref={ptyInputRef}
                className="dialog-terminal__input dialog-terminal__input--pty"
                rows={1}
                value={ptyDraft}
                placeholder={
                  status !== "running"
                    ? "Session is not accepting input."
                    : activeCommand?.command
                      ? `Send input to: ${activeCommand.command}`
                      : "Send input to the running command"
                }
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={(event) => {
                  setPtyDraft(event.target.value);
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!text) {
                    return;
                  }

                  event.preventDefault();
                  setPtyDraft("");
                  writePtyInput(text);
                }}
                onCompositionStart={() => {
                  ptyComposingRef.current = true;
                  setIsComposing(true);
                }}
                onCompositionEnd={(event) => {
                  ptyComposingRef.current = false;
                  setIsComposing(false);
                  const data = event.currentTarget.value;
                  setPtyDraft("");
                  writePtyInput(data);
                }}
                onKeyDown={(event) => {
                  if (ptyComposingRef.current) {
                    return;
                  }

                  const data = resolveDialogPtyKeyInput(event);
                  if (data === null) {
                    return;
                  }

                  event.preventDefault();
                  setPtyDraft("");
                  writePtyInput(data);
                }}
              />
            ) : (
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
            )}
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
    </div>
  );
}

function CommandBlockOutput({ output }: { output: string }) {
  const tokens = useMemo(() => tokenizeDialogOutput(output), [output]);

  return (
    <pre className="command-block__output">
      <HighlightedTokens tokens={tokens} />
    </pre>
  );
}

function CommandTranscriptHeader({ block }: { block: CommandBlock }) {
  return (
    <p className="command-block__header">
      <span className="command-block__cwd">{block.cwd}</span>
      <span className="command-block__sigil">$</span>
      <HighlightedTokens tokens={highlightCommandText(block.command ?? "")} />
    </p>
  );
}

function HighlightedTokens({ tokens }: { tokens: Array<HistoryHighlightToken | DialogOutputToken> }) {
  return (
    <>
      {tokens.map((token, index) => {
        const style = "style" in token ? token.style : null;

        return (
          <span
            key={`${token.kind}:${index}:${token.text}`}
            className={style ? undefined : `history-token history-token--${token.kind}`}
            style={style ?? undefined}
          >
            {token.text}
          </span>
        );
      })}
    </>
  );
}
