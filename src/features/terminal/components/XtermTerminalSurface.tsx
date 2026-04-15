import { useEffect, useRef, type MutableRefObject } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { createImeTextareaGuard } from "../lib/ime-textarea-guard";
import { applyTerminalAppearance } from "../lib/terminal-appearance";
import { registerTerminal, unregisterTerminal } from "../lib/terminal-registry";

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
}: XtermTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialFocusEnabledRef = useRef(isActive && !inputSuspended);
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
    if (initialFocusEnabledRef.current) {
      terminal.focus();
    }

    // 注册到全局注册表，让 PTY 输出可以直接写入
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
      unregisterTerminal(tabId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
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
