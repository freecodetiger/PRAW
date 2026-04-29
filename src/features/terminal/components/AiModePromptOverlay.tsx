import { useEffect, useLayoutEffect, useRef } from "react";

interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  voiceAvailable?: boolean;
  voiceConfigured?: boolean;
  voiceActive?: boolean;
  voicePendingFinal?: boolean;
  voiceDisabled?: boolean;
  liveTranscript?: string;
  onChange: (value: string) => void;
  onCollapse: () => void;
  onSubmit: () => Promise<void> | void;
  onVoiceToggle?: () => Promise<void> | void;
  onVoiceCancel?: () => Promise<void> | void;
}

export function AiModePromptOverlay({
  expanded,
  draft,
  disabled = false,
  error = null,
  statusMessage = null,
  voiceAvailable = false,
  voiceConfigured = false,
  voiceActive = false,
  voicePendingFinal = false,
  voiceDisabled = false,
  liveTranscript = "",
  onChange,
  onCollapse,
  onSubmit,
  onVoiceToggle,
  onVoiceCancel,
}: AiModePromptOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  const onCollapseRef = useRef(onCollapse);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCollapseRef.current = onCollapse;
  }, [onCollapse]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (draftRef.current.trim().length > 0) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onCollapseRef.current();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || disabled) {
      return;
    }

    inputRef.current?.focus({ preventScroll: true });
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, [expanded, disabled]);

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    if (!expanded || !pendingSelection) {
      return;
    }

    pendingSelectionRef.current = null;
    inputRef.current?.setSelectionRange(pendingSelection.start, pendingSelection.end);
  }, [draft, expanded]);

  useEffect(() => {
    if (!expanded || disabled) {
      return;
    }

    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    const handleBeforeInput = (event: InputEvent) => {
      const text = readAtomicSmartQuoteInput(event);
      if (!text) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const source = draftRef.current;
      const selectionStart = textarea.selectionStart ?? source.length;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const next = `${source.slice(0, selectionStart)}${text}${source.slice(selectionEnd)}`;
      const caret = selectionStart + text.length;

      draftRef.current = next;
      pendingSelectionRef.current = { start: caret, end: caret };
      textarea.value = next;
      textarea.setSelectionRange(caret, caret);
      onChangeRef.current(next);
    };

    textarea.addEventListener("beforeinput", handleBeforeInput as EventListener, { capture: true });
    return () => {
      textarea.removeEventListener("beforeinput", handleBeforeInput as EventListener, { capture: true });
    };
  }, [disabled, expanded]);

  if (!expanded) {
    return null;
  }

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded="true">
      <div className="ai-workflow__bypass-panel" ref={panelRef}>
        <div className="ai-workflow__bypass-input-row">
          <textarea
            ref={inputRef}
            className="dialog-terminal__ai-prompt-input ai-workflow__bypass-input"
            aria-label="AI prompt input"
            rows={1}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            value={draft}
            disabled={disabled}
            placeholder=""
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                void onSubmit();
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (voiceActive || voicePendingFinal) {
                  void onVoiceCancel?.();
                  return;
                }
                onCollapse();
              }
            }}
          />

          {voiceAvailable ? (
            <button
              className={`button button--ghost ai-workflow__bypass-voice${voiceActive ? " ai-workflow__bypass-voice--active" : ""}${voicePendingFinal ? " ai-workflow__bypass-voice--pending" : ""}`}
              type="button"
              aria-label="Toggle voice input"
              disabled={disabled || voiceDisabled || voicePendingFinal || !voiceConfigured}
              onClick={() => {
                void onVoiceToggle?.();
              }}
            >
              {voicePendingFinal ? "Transcribing…" : voiceActive ? "Stop" : "Mic"}
            </button>
          ) : null}
        </div>

        {liveTranscript.trim().length > 0 ? (
          <div className="ai-workflow__bypass-live" aria-label="Live transcript preview">
            {liveTranscript}
          </div>
        ) : null}

        {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
        {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
      </div>
    </div>
  );
}

function readAtomicSmartQuoteInput(event: InputEvent): string {
  const inputType = typeof event.inputType === "string" ? event.inputType : "";
  const data = typeof event.data === "string" ? event.data : "";

  if (event.isComposing || inputType !== "insertText") {
    return "";
  }

  if (data === "“”") {
    return "“";
  }

  if (data === "‘’") {
    return "‘";
  }

  return isSmartQuote(data) ? data : "";
}

function isSmartQuote(value: string): boolean {
  return value === "“" || value === "”" || value === "‘" || value === "’";
}
