import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { AiWorkflowSurface } from "./AiWorkflowSurface";
import { DialogTerminalSurface } from "./DialogTerminalSurface";

interface BlockWorkspaceSurfaceProps {
  tabId: string;
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  paneHeight: number;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  onSubmitCommand: (command: string) => void;
  onSubmitAiInput: (input: string) => Promise<void> | void;
  quickPromptOpenRequestKey?: number;
  voiceBypassToggleRequestKey?: number;
}

export function BlockWorkspaceSurface({
  tabId,
  paneState,
  status,
  sessionId,
  paneHeight,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  onSubmitCommand,
  onSubmitAiInput,
  quickPromptOpenRequestKey = 0,
  voiceBypassToggleRequestKey = 0,
}: BlockWorkspaceSurfaceProps) {
  if (paneState.presentation === "agent-workflow") {
    return (
      <AiWorkflowSurface
        tabId={tabId}
        paneState={paneState}
        status={status}
        sessionId={sessionId}
        fontFamily={fontFamily}
        fontSize={fontSize}
        theme={theme}
        isActive={isActive}
        write={write}
        resize={resize}
        onSubmitAiInput={onSubmitAiInput}
        quickPromptOpenRequestKey={quickPromptOpenRequestKey}
        voiceBypassToggleRequestKey={voiceBypassToggleRequestKey}
      />
    );
  }

  return (
    <DialogTerminalSurface
      tabId={tabId}
      paneState={paneState}
      status={status}
      sessionId={sessionId}
      paneHeight={paneHeight}
      fontFamily={fontFamily}
      fontSize={fontSize}
      theme={theme}
      onSubmitCommand={onSubmitCommand}
      isActive={isActive}
      write={write}
      resize={resize}
    />
  );
}
