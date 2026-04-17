import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (draft.trim().length > 0) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onCollapse();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded, draft, onCollapse]);

  useEffect(() => {
    if (!expanded || disabled) {
      return;
    }

    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, [expanded, disabled]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 160)}px`;
  }, [draft, expanded]);

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
