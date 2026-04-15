import { useEffect, useRef } from "react";

interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  onChange: (value: string) => void;
  onCollapse: () => void;
  onSubmit: () => Promise<void> | void;
}

export function AiModePromptOverlay({
  expanded,
  draft,
  disabled = false,
  error = null,
  statusMessage = null,
  onChange,
  onCollapse,
  onSubmit,
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

  if (!expanded) {
    return null;
  }

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded="true">
      <div className="ai-workflow__bypass-panel" ref={panelRef}>
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
              void onSubmit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCollapse();
            }
          }}
        />
        {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
        {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
      </div>
    </div>
  );
}
