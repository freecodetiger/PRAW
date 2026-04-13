import { useCallback, useEffect, useMemo, useRef } from "react";

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
  const queryColorResponses = useMemo(
    () =>
      ({
        10: toOscRgb(theme.foreground),
        11: toOscRgb(theme.background),
        12: toOscRgb(theme.cursor),
      }) as const,
    [theme.background, theme.cursor, theme.foreground],
  );
  const installTerminalGuards = useCallback(
    (terminal: Terminal) =>
      installClassicTerminalProtocolGuards({
        parser: terminal.parser,
        sendResponse: write,
        queryColorResponses,
      }),
    [queryColorResponses, write],
  );

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
      installTerminalGuards={installTerminalGuards}
    />
  );
}

function toOscRgb(color: string): string {
  const normalized = color.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (hex.length !== 6 || /[^0-9a-f]/iu.test(hex)) {
    return "rgb:ffff/ffff/ffff";
  }

  const red = hex.slice(0, 2);
  const green = hex.slice(2, 4);
  const blue = hex.slice(4, 6);
  return `rgb:${red}${red}/${green}${green}/${blue}${blue}`;
}
