import { useEffect, useMemo, useRef, useState } from "react";

import { getCurrentWindow, type DragDropEvent } from "@tauri-apps/api/window";

import { getNextPhraseSelection, getPhraseMatches } from "../../../domain/terminal/phrase-completion";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  appendDroppedPathsToDraft,
  formatDroppedPathsForShell,
  isDragPositionInsidePane,
} from "../lib/ai-drop-paths";
import { formatDialogPromptPath } from "../lib/dialog-prompt-path";
import { useSuggestionEngine } from "../hooks/useSuggestionEngine";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { SuggestionBar } from "./SuggestionBar";

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
  const aiConfig = useAppConfigStore((state) => state.config.ai);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const [draft, setDraft] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorAtEnd, setCursorAtEnd] = useState(true);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionBarVisible, setSuggestionBarVisible] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [composerWidth, setComposerWidth] = useState(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dismissSuggestionsRef = useRef<() => void>(() => undefined);
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
    ghostSuggestion,
    visibleSuggestions,
    activeGroup,
    aiStatus,
    inputMode,
    requestIntentSuggestions,
    acceptGhostSuggestion,
    acceptSuggestion,
    dismissSuggestions,
  } = useSuggestionEngine({
    paneState,
    status,
    draft,
    cursorAtEnd,
    browsingHistory: historyIndex !== null,
    isComposing,
    isFocused,
    disabled: phraseMatches.length > 0,
  });

  const suggestion =
    activePhrase?.suffix ??
    (ghostSuggestion?.replacement.type === "append" ? ghostSuggestion.replacement.suffix : "");
  const showGhostOverlay = suggestion.length > 0 && isFocused && cursorAtEnd && !isComposing && historyIndex === null;
  const autoSuggestionBarEnabled =
    aiConfig.smartSuggestionBubble &&
    phraseMatches.length === 0 &&
    visibleSuggestions.length >= 3 &&
    isFocused &&
    cursorAtEnd &&
    !isComposing &&
    historyIndex === null;
  const showSuggestionBar =
    (suggestionBarVisible || autoSuggestionBarEnabled) &&
    phraseMatches.length === 0 &&
    (visibleSuggestions.length > 0 || aiStatus.state !== "idle") &&
    isFocused &&
    cursorAtEnd &&
    !isComposing &&
    historyIndex === null;
  const canNavigateVisibleSuggestionBar =
    showSuggestionBar &&
    visibleSuggestions.length > 0 &&
    !isComposing;
  const isDisabled = status !== "running";
  const promptPath = formatDialogPromptPath(paneState.cwd, composerWidth);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    inputRef.current?.focus();
  }, [isActive]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }

    const updateWidth = () => setComposerWidth(composer.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPhraseIndex(0);
  }, [draft, terminalConfig.phrases, terminalConfig.phraseUsage]);

  useEffect(() => {
    setSuggestionIndex(0);
  }, [draft, visibleSuggestions]);

  useEffect(() => {
    setSuggestionBarVisible(false);
  }, [draft]);

  useEffect(() => {
    dismissSuggestionsRef.current = dismissSuggestions;
  }, [dismissSuggestions]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const isEventInsideComposer = (payload: DragDropEvent) => {
      if (payload.type === "leave") {
        return false;
      }

      const composer = composerRef.current;
      if (!composer) {
        return false;
      }

      return isDragPositionInsidePane(
        payload.position,
        composer.getBoundingClientRect(),
      );
    };

    const subscribe = async () => {
      try {
        const currentWindow = getCurrentWindow();
        unlisten = await currentWindow.onDragDropEvent((event) => {
          const payload = event.payload;
          const insideComposer = isEventInsideComposer(payload);

          if (payload.type === "enter" || payload.type === "over") {
            setFileDropActive(insideComposer);
            return;
          }

          if (payload.type === "leave") {
            setFileDropActive(false);
            return;
          }

          setFileDropActive(false);
          if (!insideComposer || isDisabled) {
            return;
          }

          const droppedText = formatDroppedPathsForShell(payload.paths);
          if (!droppedText) {
            return;
          }

          setDraft((current) => appendDroppedPathsToDraft(current, droppedText));
          setHistoryIndex(null);
          setCursorAtEnd(true);
          setPhraseIndex(0);
          setSuggestionIndex(0);
          setSuggestionBarVisible(false);
          dismissSuggestionsRef.current();
        });
      } catch {
        unlisten = null;
      }
    };

    void subscribe();

    return () => {
      setFileDropActive(false);
      if (unlisten) {
        unlisten();
      }
    };
  }, [isDisabled]);

  const syncCursorState = (input: HTMLTextAreaElement) => {
    const end = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    setCursorAtEnd(end);
  };

  const acceptVisibleSuggestion = (index = suggestionIndex) => {
    const nextDraft = acceptSuggestion(index);
    if (!nextDraft) {
      return;
    }

    setDraft(nextDraft);
    setHistoryIndex(null);
    setCursorAtEnd(true);
    setSuggestionIndex(0);
    setSuggestionBarVisible(false);
  };

  const acceptGhostOverlay = () => {
    const nextDraft = activePhrase ? draft + activePhrase.suffix : acceptGhostSuggestion();
    if (!nextDraft) {
      return;
    }

    if (activePhrase) {
      const nextUsageScore = Math.max(0, ...Object.values(terminalConfig.phraseUsage)) + 1;
      patchTerminalConfig({
        phraseUsage: {
          ...terminalConfig.phraseUsage,
          [activePhrase.phrase]: nextUsageScore,
        },
      });
    }

    setDraft(nextDraft);
    setHistoryIndex(null);
    setCursorAtEnd(true);
    setPhraseIndex(0);
    setSuggestionIndex(0);
    setSuggestionBarVisible(false);
  };

  const submit = () => {
    const command = draft.trim();
    if (!command || isDisabled) {
      return;
    }

    dismissSuggestions();
    onSubmitCommand(command);
    setDraft("");
    setHistoryIndex(null);
    setHistoryDraft("");
    setCursorAtEnd(true);
    setPhraseIndex(0);
    setSuggestionIndex(0);
    setSuggestionBarVisible(false);
  };

  return (
    <div ref={composerRef} className="dialog-terminal__composer" onMouseDown={() => inputRef.current?.focus()}>
      <span className="dialog-terminal__prompt" title={paneState.cwd}>{promptPath} $</span>
      <div className="dialog-terminal__input-column">
        {fileDropActive ? (
          <div className="dialog-terminal__file-drop-target" aria-label="Dialog file drop target">
            <div className="dialog-terminal__file-drop-frame">Drop files to insert paths</div>
          </div>
        ) : null}
        {showSuggestionBar && activeGroup ? (
          <SuggestionBar
            suggestions={visibleSuggestions}
            activeIndex={suggestionIndex}
            activeGroup={activeGroup}
            aiStatus={aiStatus}
            onAccept={acceptVisibleSuggestion}
          />
        ) : null}
        <div className="dialog-terminal__input-shell">
          {showGhostOverlay ? (
            <div className="dialog-terminal__ghost" aria-hidden="true">
              <span className="dialog-terminal__ghost-prefix">{draft}</span>
              <span className="dialog-terminal__ghost-suffix">{suggestion}</span>
            </div>
          ) : null}
          <textarea
            ref={inputRef}
            className="dialog-terminal__input dialog-terminal__input--multiline"
            disabled={isDisabled}
            placeholder={status !== "running" ? "Session is not accepting input." : showGhostOverlay ? "" : "Run a command"}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            value={draft}
            rows={1}
            onChange={(event) => {
              setDraft(event.target.value);
              syncCursorState(event.target);
              if (historyIndex !== null) {
                setHistoryIndex(null);
              }
              setSuggestionBarVisible(false);
              // 自动调整高度
              const target = event.target;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`; // 最大 120px
            }}
            onFocus={(event) => {
              setIsFocused(true);
              syncCursorState(event.target);
            }}
            onBlur={() => {
              setIsFocused(false);
              setSuggestionBarVisible(false);
            }}
            onClick={(event) => syncCursorState(event.currentTarget)}
            onKeyUp={(event) => syncCursorState(event.currentTarget)}
            onSelect={(event) => syncCursorState(event.currentTarget)}
            onCompositionStart={() => {
              setIsComposing(true);
              setSuggestionBarVisible(false);
            }}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              syncCursorState(event.currentTarget);
            }}
            onKeyDown={(event) => {
              // Shift+Enter 允许换行
              if (event.key === "Enter" && event.shiftKey) {
                // 允许默认行为（插入换行）
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                submit();
                return;
              }

              if (event.ctrlKey && event.key === "ArrowUp" && phraseMatches.length > 1) {
                event.preventDefault();
                setSuggestionBarVisible(false);
                setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "previous"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowDown" && phraseMatches.length > 1) {
                event.preventDefault();
                setSuggestionBarVisible(false);
                setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "next"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowUp" && visibleSuggestions.length > 1) {
                event.preventDefault();
                setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "previous"));
                return;
              }

              if (event.ctrlKey && event.key === "ArrowDown" && visibleSuggestions.length > 1) {
                event.preventDefault();
                setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "next"));
                return;
              }

              if (
                event.key === "Tab" &&
                !isComposing &&
                ((phraseMatches.length > 0 && suggestion.length > 0) || visibleSuggestions.length > 0)
              ) {
                event.preventDefault();
                setSuggestionBarVisible(true);
                return;
              }

              if (event.key === "Tab" && !isComposing && inputMode === "intent") {
                event.preventDefault();
                setSuggestionBarVisible(true);
                requestIntentSuggestions();
                return;
              }

              if (
                event.key === "ArrowRight" &&
                showSuggestionBar &&
                visibleSuggestions.length > 0 &&
                !isComposing &&
                cursorAtEnd
              ) {
                event.preventDefault();
                acceptVisibleSuggestion();
                return;
              }

              if (event.key === "ArrowRight" && suggestion.length > 0 && !isComposing && cursorAtEnd) {
                event.preventDefault();
                acceptGhostOverlay();
                return;
              }

              if (event.key === "ArrowUp" && canNavigateVisibleSuggestionBar && visibleSuggestions.length > 1) {
                event.preventDefault();
                setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "previous"));
                return;
              }

              if (event.key === "ArrowDown" && canNavigateVisibleSuggestionBar && visibleSuggestions.length > 1) {
                event.preventDefault();
                setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "next"));
                return;
              }

              if (event.key === "Escape" && (suggestionBarVisible || visibleSuggestions.length > 0 || suggestion)) {
                event.preventDefault();
                setSuggestionBarVisible(false);
                dismissSuggestions();
                return;
              }

              if (event.key === "ArrowUp") {
                if (history.length === 0) {
                  return;
                }

                event.preventDefault();
                setSuggestionBarVisible(false);
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
                setSuggestionBarVisible(false);
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

      </div>
    </div>
  );
}
