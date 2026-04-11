import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { getTerminalReplayPlan } from "../lib/output-replay";
import { applyTerminalAppearance } from "../lib/terminal-appearance";

interface ClassicTerminalSurfaceProps {
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function ClassicTerminalSurface({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  backgroundColor,
  isActive,
  write,
  resize,
}: ClassicTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const appliedBufferContentRef = useRef("");
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
      theme: {
        background: backgroundColor,
        foreground: "#000000",
        cursor: "#000000",
        black: "#000000",
        brightBlack: "#4a4a4a",
        red: "#8a0000",
        brightRed: "#b30000",
        green: "#006400",
        brightGreen: "#008000",
        yellow: "#7a5c00",
        brightYellow: "#9b7500",
        blue: "#003d99",
        brightBlue: "#0052cc",
        magenta: "#6b2f8a",
        brightMagenta: "#8a3fb3",
        cyan: "#005f5f",
        brightCyan: "#007a7a",
        white: "#d8d8d8",
        brightWhite: "#f2f2f2",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.focus();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    appliedBufferContentRef.current = "";

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
      imeGuard?.dispose();
      textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      appliedBufferContentRef.current = "";
    };
  }, [backgroundColor, fontFamily, fontSize, handleShortcutKeyDown, resize, write]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    applyTerminalAppearance(xtermRef.current, {
      fontFamily,
      fontSize,
      backgroundColor,
    });

    queueMicrotask(() => {
      fitAddonRef.current?.fit();
      if (xtermRef.current) {
        void resize(xtermRef.current.cols, xtermRef.current.rows);
      }
    });
  }, [backgroundColor, fontFamily, fontSize, resize]);

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

  return (
    <div
      className="terminal-pane__body"
      onMouseDown={() => {
        xtermRef.current?.focus();
      }}
    >
      <div className="terminal-pane__xterm" ref={containerRef} />
    </div>
  );
}
