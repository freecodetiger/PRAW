import { useEffect, useRef } from "react";

import { Terminal } from "@xterm/xterm";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import type { TerminalPresentation } from "../../../domain/terminal/dialog";
import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import {
  buildClassicTerminalWorkflowResetSequence,
  installClassicTerminalProtocolGuards,
} from "../lib/classic-terminal-guards";
import { XtermTerminalSurface } from "./XtermTerminalSurface";

interface ClassicTerminalSurfaceProps {
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  presentation: TerminalPresentation;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function ClassicTerminalSurface({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  theme,
  isActive,
  presentation,
  write,
  resize,
}: ClassicTerminalSurfaceProps) {
  const xtermRef = useRef<Terminal | null>(null);
  const previousPresentationRef = useRef<TerminalPresentation>(presentation);

  useEffect(() => {
    const previousPresentation = previousPresentationRef.current;
    previousPresentationRef.current = presentation;

    if (!xtermRef.current) {
      return;
    }

    if (previousPresentation === "agent-workflow" && presentation === "default") {
      xtermRef.current.write(buildClassicTerminalWorkflowResetSequence());
    }
  }, [presentation]);

  return (
    <XtermTerminalSurface
      sessionId={sessionId}
      bufferedOutput={bufferedOutput}
      fontFamily={fontFamily}
      fontSize={fontSize}
      theme={theme}
      isActive={isActive}
      write={write}
      resize={resize}
      terminalRef={xtermRef}
      installTerminalGuards={installClassicTerminalProtocolGuards}
    />
  );
}
