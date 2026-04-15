import { useEffect, useRef } from "react";

import type { StructuredAiCommandCapabilities } from "../lib/ai-command";
import { StructuredAiPromptInput } from "./StructuredAiPromptInput";

interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  commandCapabilities: StructuredAiCommandCapabilities;
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
  commandCapabilities,
  disabled = false,
  error = null,
  statusMessage = null,
  onChange,
  onCollapse,
  onSubmit,
}: AiModePromptOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  if (!expanded) {
    return null;
  }

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded="true">
      <div className="ai-workflow__bypass-panel" ref={panelRef}>
        <StructuredAiPromptInput
          draft={draft}
          commandCapabilities={commandCapabilities}
          ariaLabel="AI prompt input"
          className="dialog-terminal__ai-prompt-input ai-workflow__bypass-input"
          rows={1}
          autoFocus={true}
          autoResize={true}
          disabled={disabled}
          placeholder=""
          onChange={onChange}
          onSubmit={onSubmit}
          onEscape={onCollapse}
        />
        {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
        {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
      </div>
    </div>
  );
}
