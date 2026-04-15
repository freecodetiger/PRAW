import { useEffect, useRef } from "react";

const MIN_INPUT_HEIGHT_PX = 40;
const MAX_INPUT_HEIGHT_PX = 160;

interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  onExpand: () => void;
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
  onExpand,
  onChange,
  onCollapse,
  onSubmit,
}: AiModePromptOverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const syncInputHeight = () => {
    const input = inputRef.current;
    if (!input || !expanded) {
      return;
    }

    input.style.height = "0px";
    const nextHeight = Math.max(MIN_INPUT_HEIGHT_PX, Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > MAX_INPUT_HEIGHT_PX ? "auto" : "hidden";
  };

  useEffect(() => {
    if (!expanded || disabled) {
      return;
    }

    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
    syncInputHeight();
  }, [disabled, expanded]);

  useEffect(() => {
    syncInputHeight();
  }, [draft, expanded]);

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded={expanded ? "true" : "false"}>
      <button
        className="ai-workflow__bypass-capsule"
        type="button"
        aria-label="Open quick AI prompt"
        onClick={onExpand}
      >
        Prompt
      </button>
      <div className="ai-workflow__bypass-dock-panel">
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
          onChange={(event) => {
            onChange(event.target.value);
            syncInputHeight();
          }}
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
