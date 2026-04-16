import { useEffect, useState } from "react";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { AiModePromptOverlay } from "./AiModePromptOverlay";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";

interface AiWorkflowSurfaceProps {
  tabId: string;
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  onSubmitAiInput: (input: string) => Promise<void> | void;
  quickPromptOpenRequestKey?: number;
}

export function AiWorkflowSurface({
  tabId,
  paneState,
  status,
  sessionId,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  onSubmitAiInput,
  quickPromptOpenRequestKey = 0,
}: AiWorkflowSurfaceProps) {
  void paneState;
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const showsBypassCapsule = true;
  const composerDisabled = status !== "running";

  useEffect(() => {
    if (quickPromptOpenRequestKey <= 0 || !showsBypassCapsule) {
      return;
    }

    setBypassPromptOpen(true);
    setBypassError(null);
  }, [quickPromptOpenRequestKey, showsBypassCapsule]);

  const closeBypassPrompt = () => {
    if (bypassDraft.trim().length > 0) {
      return;
    }

    setBypassPromptOpen(false);
    setBypassError(null);
  };

  const submitBypassPrompt = async () => {
    const normalizedInput = bypassDraft.trim();
    if (!normalizedInput || composerDisabled || isBypassSubmitting) {
      return;
    }

    setIsBypassSubmitting(true);
    setBypassError(null);

    try {
      await onSubmitAiInput(normalizedInput);
      setBypassDraft("");
      setBypassPromptOpen(false);
    } catch {
      setBypassError("Could not send prompt. The draft was kept so you can retry.");
    } finally {
      setIsBypassSubmitting(false);
    }
  };

  return (
    <div className="ai-workflow">
      {showsBypassCapsule ? (
        <AiModePromptOverlay
          expanded={bypassPromptOpen}
          draft={bypassDraft}
          disabled={composerDisabled || isBypassSubmitting}
          error={bypassError}
          statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
          onChange={(value) => {
            setBypassDraft(value);
            setBypassError(null);
          }}
          onCollapse={closeBypassPrompt}
          onSubmit={submitBypassPrompt}
        />
      ) : null}

      <div className="ai-workflow__bootstrap-terminal">
        <ClassicTerminalSurface
          tabId={tabId}
          sessionId={sessionId}
          fontFamily={fontFamily}
          fontSize={fontSize}
          theme={theme}
          isActive={isActive}
          inputSuspended={false}
          write={write}
          resize={resize}
        />
      </div>
    </div>
  );
}
