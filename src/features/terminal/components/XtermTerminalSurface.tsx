import { useEffect, useRef, type MutableRefObject } from "react";

import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { useTerminalClipboard } from "../hooks/useTerminalClipboard";
import { ensurePersistentTerminalRuntime, type PersistentTerminalRuntimeConfig } from "../lib/persistent-terminal-runtime";
import { getTerminal, registerTerminal } from "../lib/terminal-registry";

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
  const runtimeRef = useRef<ReturnType<typeof ensurePersistentTerminalRuntime> | null>(null);
  const { handleShortcutKeyDown } = useTerminalClipboard(terminalRef);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const config: PersistentTerminalRuntimeConfig = {
      fontFamily,
      fontSize,
      theme,
      write,
      resize,
      installTerminalGuards,
    };
    const runtime = ensurePersistentTerminalRuntime(tabId, config);
    runtimeRef.current = runtime;

    if (getTerminal(tabId) !== runtime.controller) {
      registerTerminal(tabId, runtime.controller);
    }

    runtime.attach({
      container: containerRef.current,
      isActive,
      inputSuspended,
    });

    terminalRef.current = runtime.getTerminal();
    if (forwardedTerminalRef) {
      forwardedTerminalRef.current = terminalRef.current;
    }

    const textarea = terminalRef.current?.textarea;
    textarea?.addEventListener("keydown", handleShortcutKeyDown, { capture: true });

    return () => {
      textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
      runtime.detach();
      terminalRef.current = null;
      if (forwardedTerminalRef) {
        forwardedTerminalRef.current = null;
      }
    };
  }, [forwardedTerminalRef, handleShortcutKeyDown, tabId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !containerRef.current) {
      return;
    }

    runtime.updateConfig({
      fontFamily,
      fontSize,
      theme,
      write,
      resize,
      installTerminalGuards,
    });
    runtime.attach({
      container: containerRef.current,
      isActive,
      inputSuspended,
    });

    terminalRef.current = runtime.getTerminal();
    if (forwardedTerminalRef) {
      forwardedTerminalRef.current = terminalRef.current;
    }
  }, [fontFamily, fontSize, forwardedTerminalRef, inputSuspended, installTerminalGuards, isActive, resize, theme, write]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !sessionId) {
      return;
    }

    runtime.updateConfig({
      fontFamily,
      fontSize,
      theme,
      write,
      resize,
      installTerminalGuards,
    });
  }, [fontFamily, fontSize, installTerminalGuards, resize, sessionId, theme, write]);

  return <div ref={containerRef} className={className} />;
}
