import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import type { TerminalPresentation } from "../../../domain/terminal/dialog";
import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import {
  buildClassicTerminalWorkflowResetSequence,
  installClassicTerminalProtocolGuards,
} from "../lib/classic-terminal-guards";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { getTerminalReplayPlan } from "../lib/output-replay";
import { applyTerminalAppearance } from "../lib/terminal-appearance";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const appliedBufferContentRef = useRef("");
  const previousPresentationRef = useRef<TerminalPresentation>(presentation);
  const { handleShortcutKeyDown } = useTerminalClipboard(xtermRef);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.3,
      theme,
    });

    const removeProtocolGuards = installClassicTerminalProtocolGuards(terminal);
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.focus();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    appliedBufferContentRef.current = "";
    previousPresentationRef.current = presentation;

    const dataDisposable = terminal.onData((data) => {
      void write(data);
    });

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void resize(cols, rows);
    });

    const textarea = terminal.textarea;
    const imeGuard = textarea ? createImeTextareaGuard(textarea) : null;
    textarea?.addEventListener("keydown", handleShortcutKeyDown, { capture: true });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      void resize(terminal.cols, terminal.rows);
    });

    observer.observe(containerRef.current);

    queueMicrotask(() => {
      fitAddon.fit();
      void resize(terminal.cols, terminal.rows);
    });

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      removeProtocolGuards();
      imeGuard?.dispose();
      textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      appliedBufferContentRef.current = "";
    };
  }, [fontFamily, fontSize, handleShortcutKeyDown, presentation, resize, theme, write]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    applyTerminalAppearance(xtermRef.current, {
      fontFamily,
      fontSize,
      theme,
    });

    queueMicrotask(() => {
      fitAddonRef.current?.fit();
      if (xtermRef.current) {
        void resize(xtermRef.current.cols, xtermRef.current.rows);
      }
    });
  }, [fontFamily, fontSize, resize, theme]);

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

  useEffect(() => {
    if (!isActive || !xtermRef.current) {
      return;
    }

    queueMicrotask(() => {
      xtermRef.current?.focus();
    });
  }, [isActive, sessionId]);

  useEffect(() => {
    if (!sessionId || !xtermRef.current || !fitAddonRef.current) {
      return;
    }

    queueMicrotask(() => {
      if (!xtermRef.current || !fitAddonRef.current) {
        return;
      }

      fitAddonRef.current.fit();
      void resize(xtermRef.current.cols, xtermRef.current.rows);
    });
  }, [sessionId, resize]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    const replayPlan = getTerminalReplayPlan(appliedBufferContentRef.current, bufferedOutput.content);
    if (replayPlan.type === "noop") {
      return;
    }

    if (replayPlan.type === "append") {
      if (!replayPlan.content) {
        return;
      }

      terminal.write(replayPlan.content);
      appliedBufferContentRef.current = bufferedOutput.content;
      return;
    }

    terminal.reset();
    appliedBufferContentRef.current = "";

    if (!replayPlan.content) {
      return;
    }

    terminal.write(replayPlan.content);
    appliedBufferContentRef.current = replayPlan.content;
  }, [bufferedOutput]);

  return <div ref={containerRef} className="terminal-pane__xterm" />;
}
