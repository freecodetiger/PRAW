import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { useTranscriptViewport } from "../hooks/useTranscriptViewport";
import { resolveDialogSurfaceModel } from "../lib/dialog-surface-model";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { DialogIdleComposer } from "./DialogIdleComposer";
import { DialogTranscript } from "./DialogTranscript";
import { LiveCommandConsole } from "./LiveCommandConsole";

interface DialogTerminalSurfaceProps {
  tabId: string;
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  paneHeight: number;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  onSubmitCommand: (command: string) => void;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function DialogTerminalSurface({
  tabId,
  paneState,
  status,
  sessionId,
  paneHeight,
  fontFamily,
  fontSize,
  theme,
  onSubmitCommand,
  isActive,
  write,
  resize,
}: DialogTerminalSurfaceProps) {
  const surfaceModel = resolveDialogSurfaceModel({
    paneHeight,
    paneState,
  });
  const { scrollRef, bottomRef, isPinnedBottom, onScroll, jumpToLatest } = useTranscriptViewport({
    tabId,
    contentKey: paneState.blocks,
  });
  const activeCommand =
    paneState.activeCommandBlockId === null
      ? null
      : paneState.blocks.find((block) => block.id === paneState.activeCommandBlockId) ?? null;

  return (
    <div className="dialog-terminal">
      <div className="dialog-terminal__history-shell">
        <DialogTranscript
          blocks={paneState.blocks}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          onScroll={onScroll}
        />

        {!isPinnedBottom ? (
          <div className="dialog-terminal__jump">
            <button
              className="button button--ghost"
              type="button"
              onClick={jumpToLatest}
            >
              Jump to latest
            </button>
          </div>
        ) : null}
      </div>

      {surfaceModel.liveConsole && activeCommand?.command ? (
        <LiveCommandConsole
          tabId={tabId}
          sessionId={sessionId}
          command={activeCommand.command}
          cwd={activeCommand.cwd}
          fontFamily={fontFamily}
          fontSize={fontSize}
          theme={theme}
          isActive={isActive}
          compact={surfaceModel.liveConsole.compact}
          heightPx={surfaceModel.liveConsole.heightPx}
          write={write}
          resize={resize}
        />
      ) : null}

      {surfaceModel.idleComposerVisible ? (
        <DialogIdleComposer
          paneState={paneState}
          status={status}
          isActive={isActive}
          onSubmitCommand={onSubmitCommand}
        />
      ) : null}
    </div>
  );
}
