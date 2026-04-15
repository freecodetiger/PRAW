import { useEffect, useRef } from "react";

interface AiModePromptOverlayProps {
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
}

export function AiModePromptOverlay({
  draft,
  disabled = false,
  error = null,
  statusMessage = null,
  onChange,
  onClose,
  onSubmit,
}: AiModePromptOverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (disabled) {
      return;
    }

    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, [disabled]);

  return (
    <div className="dialog-terminal__ai-prompt-overlay" aria-label="AI prompt overlay">
      <div className="dialog-terminal__ai-prompt-shell">
        <div className="dialog-terminal__ai-prompt-header">
          <strong>Quick Prompt</strong>
          <span>Esc to close</span>
        </div>
        <textarea
          ref={inputRef}
          className="dialog-terminal__ai-prompt-input"
          aria-label="AI prompt input"
          rows={1}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          value={draft}
          disabled={disabled}
          placeholder="Send a quick prompt to the running AI session"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSubmit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
        {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
      </div>
    </div>
  );
}
