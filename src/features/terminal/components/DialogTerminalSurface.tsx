import { useEffect, useRef, useState } from "react";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { resolvePinnedBottomState } from "../lib/scroll-pinning";
import { resolveDialogSurfaceModel } from "../lib/dialog-surface-model";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { DialogIdleComposer } from "./DialogIdleComposer";
import { DialogTranscript } from "./DialogTranscript";
import { LiveCommandConsole } from "./LiveCommandConsole";

interface DialogTerminalSurfaceProps {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
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
  paneState,
  status,
  sessionId,
  bufferedOutput,
  paneHeight,
  fontFamily,
  fontSize,
  theme,
  onSubmitCommand,
  isActive,
  write,
  resize,
}: DialogTerminalSurfaceProps) {
  const [isPinnedBottom, setIsPinnedBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const manualJumpPendingRef = useRef(false);
  const surfaceModel = resolveDialogSurfaceModel({
    paneHeight,
    paneState,
  });
  const activeCommand =
    paneState.activeCommandBlockId === null
      ? null
      : paneState.blocks.find((block) => block.id === paneState.activeCommandBlockId) ?? null;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !isPinnedBottom) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [isPinnedBottom, paneState.blocks, surfaceModel.phase]);

  return (
    <div className="dialog-terminal">
      <DialogTranscript
        blocks={paneState.blocks}
        scrollRef={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
          const nextPinned = resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current);
          manualJumpPendingRef.current = false;
          setIsPinnedBottom(nextPinned);
        }}
      />

      {!isPinnedBottom ? (
        <div className="dialog-terminal__jump">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              const node = scrollRef.current;
              if (!node) {
                return;
              }

              manualJumpPendingRef.current = true;
              node.scrollTop = node.scrollHeight;
              setIsPinnedBottom(true);
            }}
          >
            Jump to latest
          </button>
        </div>
      ) : null}

      {surfaceModel.liveConsole && activeCommand?.command ? (
        <LiveCommandConsole
          sessionId={sessionId}
          bufferedOutput={bufferedOutput}
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
