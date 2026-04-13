import { useEffect, useRef, type MutableRefObject } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TerminalBufferSnapshot } from "../../../domain/terminal/buffer";
import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { getTerminalReplayPlan } from "../lib/output-replay";
import { applyTerminalAppearance } from "../lib/terminal-appearance";

interface XtermTerminalSurfaceProps {
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  className?: string;
  terminalRef?: MutableRefObject<Terminal | null>;
  installTerminalGuards?: (terminal: Terminal) => (() => void) | void;
}

export function XtermTerminalSurface({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  className = "terminal-pane__xterm",
  terminalRef: forwardedTerminalRef,
  installTerminalGuards,
}: XtermTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const appliedBufferContentRef = useRef("");
  const { handleShortcutKeyDown } = useTerminalClipboard(terminalRef);

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

    const removeTerminalGuards = installTerminalGuards?.(terminal) ?? (() => undefined);
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.focus();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    appliedBufferContentRef.current = "";
    if (forwardedTerminalRef) {
      forwardedTerminalRef.current = terminal;
    }

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
      removeTerminalGuards();
      imeGuard?.dispose();
      textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      appliedBufferContentRef.current = "";
      if (forwardedTerminalRef) {
        forwardedTerminalRef.current = null;
      }
    };
  }, [fontFamily, fontSize, forwardedTerminalRef, handleShortcutKeyDown, installTerminalGuards, resize, theme, write]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    applyTerminalAppearance(terminalRef.current, {
      fontFamily,
      fontSize,
      theme,
    });

    queueMicrotask(() => {
      fitAddonRef.current?.fit();
      if (terminalRef.current) {
        void resize(terminalRef.current.cols, terminalRef.current.rows);
      }
    });
  }, [fontFamily, fontSize, resize, theme]);

  useEffect(() => {
    if (!isActive || !terminalRef.current) {
      return;
    }

    queueMicrotask(() => {
      terminalRef.current?.focus();
    });
  }, [isActive, sessionId]);

  useEffect(() => {
    if (!sessionId || !terminalRef.current || !fitAddonRef.current) {
      return;
    }

    queueMicrotask(() => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }

      fitAddonRef.current.fit();
      void resize(terminalRef.current.cols, terminalRef.current.rows);
    });
  }, [sessionId, resize]);

  useEffect(() => {
    const terminal = terminalRef.current;
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

  return <div ref={containerRef} className={className} />;
}
