import { useEffect, useRef } from "react";

interface AiModePromptOverlayProps {
  draft: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function AiModePromptOverlay({
  draft,
  onChange,
  onClose,
  onSubmit,
}: AiModePromptOverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, []);

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
          placeholder="Send a quick prompt to the running AI session"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
      </div>
    </div>
  );
}
