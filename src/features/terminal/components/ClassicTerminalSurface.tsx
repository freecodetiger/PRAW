import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import { onTerminalOutput } from "../../../lib/tauri/terminal";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { getTerminalReplayPlan } from "../lib/output-replay";
import { applyTerminalAppearance } from "../lib/terminal-appearance";

interface ClassicTerminalSurfaceProps {
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
  fontFamily: string;
  fontSize: number;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function ClassicTerminalSurface({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  write,
  resize,
}: ClassicTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const renderedContentRef = useRef("");
  const sessionIdRef = useRef<string | null>(sessionId);
  const { handleShortcutKeyDown } = useTerminalClipboard(xtermRef);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
        background: "#ffffff",
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
    renderedContentRef.current = "";

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
      renderedContentRef.current = "";
    };
  }, [fontFamily, fontSize, handleShortcutKeyDown, resize, write]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    applyTerminalAppearance(xtermRef.current, {
      fontFamily,
      fontSize,
    });

    queueMicrotask(() => {
      fitAddonRef.current?.fit();
      if (xtermRef.current) {
        void resize(xtermRef.current.cols, xtermRef.current.rows);
      }
    });
  }, [fontFamily, fontSize, resize]);

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
    let disposed = false;
    let unlistenOutput: (() => void) | undefined;

    void onTerminalOutput((event) => {
      if (event.sessionId !== sessionIdRef.current) {
        return;
      }

      const terminal = xtermRef.current;
      if (!terminal) {
        return;
      }

      terminal.write(event.data);
      renderedContentRef.current += event.data;
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlistenOutput = cleanup;
    });

    return () => {
      disposed = true;
      unlistenOutput?.();
    };
  }, []);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) {
      return;
    }

    const replayPlan = getTerminalReplayPlan(renderedContentRef.current, bufferedOutput.content);
    if (replayPlan.type !== "hydrate") {
      return;
    }

    terminal.reset();
    renderedContentRef.current = "";

    if (!replayPlan.content) {
      return;
    }

    terminal.write(replayPlan.content);
    renderedContentRef.current = replayPlan.content;
  }, [bufferedOutput]);

  return (
    <div className="terminal-pane__body">
      <div className="terminal-pane__xterm" ref={containerRef} />
    </div>
  );
}
