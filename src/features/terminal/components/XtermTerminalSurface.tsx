import { useEffect, useRef, type MutableRefObject } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { applyTerminalAppearance } from "../lib/terminal-appearance";
import { getTerminalSnapshot, registerTerminal, resetDirect, unregisterTerminal, updateViewport } from "../lib/terminal-registry";

interface XtermTerminalSurfaceProps {
  tabId: string;
  sessionId: string | null;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  className?: string;
  inputSuspended?: boolean;
  terminalRef?: MutableRefObject<Terminal | null>;
  installTerminalGuards?: (terminal: Terminal) => (() => void) | void;
  clearOnMount?: boolean;
}

export function XtermTerminalSurface({
  tabId,
  sessionId,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  className = "terminal-pane__xterm",
  inputSuspended = false,
  terminalRef: forwardedTerminalRef,
  installTerminalGuards,
  clearOnMount = false,
}: XtermTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialFocusEnabledRef = useRef(isActive && !inputSuspended);
  const isReplayingRef = useRef(false);
  const { handleShortcutKeyDown } = useTerminalClipboard(terminalRef);

  useEffect(() => {
    if (clearOnMount) {
      resetDirect(tabId);
    }
  }, [clearOnMount, tabId]);

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
    if (initialFocusEnabledRef.current) {
      terminal.focus();
    }

    registerTerminal(tabId, {
      writeDirect: (data) => {
        terminal.write(data);
      },
      pasteText: (text) => {
        terminal.paste(text);
      },
      sendEnter: async () => {
        await write("\r");
      },
      clear: () => {
        terminal.clear();
      },
      focus: () => {
        terminal.focus();
      },
      blur: () => {
        terminal.textarea?.blur();
      },
      hasSelection: () => terminal.getSelection().length > 0,
      getSelectionText: () => terminal.getSelection(),
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    if (forwardedTerminalRef) {
      forwardedTerminalRef.current = terminal;
    }

    const dataDisposable = terminal.onData((data) => {
      void write(data);
    });

    const scrollDisposable = terminal.onScroll((position) => {
      if (isReplayingRef.current) {
        return;
      }

      updateViewport(tabId, position);
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
      const snapshot = getTerminalSnapshot(tabId);
      isReplayingRef.current = true;
      if (snapshot.content.length > 0) {
        terminal.write(snapshot.content);
      }
      fitAddon.fit();
      const targetViewport = Math.max(0, Math.min(snapshot.viewportY, terminal.buffer.active.baseY));
      if (targetViewport >= terminal.buffer.active.baseY) {
        terminal.scrollToBottom();
      } else {
        terminal.scrollToLine(targetViewport);
      }
      isReplayingRef.current = false;
      void resize(terminal.cols, terminal.rows);
    });

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      scrollDisposable.dispose();
      resizeDisposable.dispose();
      removeTerminalGuards();
      imeGuard?.dispose();
      textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
      unregisterTerminal(tabId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      if (forwardedTerminalRef) {
        forwardedTerminalRef.current = null;
      }
    };
  }, [clearOnMount, fontFamily, fontSize, forwardedTerminalRef, handleShortcutKeyDown, installTerminalGuards, resize, tabId, theme, write]);

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

    if (inputSuspended) {
      terminalRef.current.textarea?.blur();
      return;
    }

    queueMicrotask(() => {
      terminalRef.current?.focus();
    });
  }, [inputSuspended, isActive, sessionId]);

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

  return <div ref={containerRef} className={className} />;
}
