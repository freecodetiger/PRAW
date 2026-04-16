import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { createImeTextareaGuard } from "./ime-textarea-guard";
import { applyTerminalAppearance } from "./terminal-appearance";
import type { TerminalController } from "./terminal-registry";
import { updateViewport } from "./terminal-registry";

export interface PersistentTerminalRuntimeConfig {
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  installTerminalGuards?: (terminal: Terminal) => (() => void) | void;
}

export interface PersistentTerminalAttachment {
  container: HTMLElement;
  isActive: boolean;
  inputSuspended: boolean;
}

class PersistentTerminalRuntime {
  private readonly tabId: string;
  private readonly host: HTMLDivElement;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private attachment: PersistentTerminalAttachment | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private imeGuard: { dispose(): void } | null = null;
  private dataDisposable: { dispose(): void } | null = null;
  private resizeDisposable: { dispose(): void } | null = null;
  private scrollDisposable: { dispose(): void } | null = null;
  private guardCleanup: (() => void) | null = null;
  private pendingWrites = "";
  private config: PersistentTerminalRuntimeConfig;
  private installedGuardFactory?: PersistentTerminalRuntimeConfig["installTerminalGuards"];

  readonly controller: TerminalController;

  constructor(tabId: string, config: PersistentTerminalRuntimeConfig) {
    this.tabId = tabId;
    this.config = config;
    this.host = document.createElement("div");
    this.host.style.width = "100%";
    this.host.style.height = "100%";
    this.host.style.minWidth = "0";
    this.host.style.minHeight = "0";

    this.controller = {
      writeDirect: (data) => {
        if (!data) {
          return;
        }

        if (!this.terminal) {
          this.pendingWrites += data;
          return;
        }

        this.terminal.write(data);
      },
      pasteText: (text) => {
        this.terminal?.paste(text);
      },
      sendEnter: async () => {
        await this.config.write("\r");
      },
      clear: () => {
        this.pendingWrites = "";
        this.terminal?.clear();
      },
      focus: () => {
        this.terminal?.focus();
      },
      blur: () => {
        this.terminal?.textarea?.blur();
      },
      hasSelection: () => (this.terminal?.getSelection().length ?? 0) > 0,
      getSelectionText: () => this.terminal?.getSelection() ?? "",
    };
  }

  getTerminal(): Terminal | null {
    return this.terminal;
  }

  updateConfig(config: PersistentTerminalRuntimeConfig): void {
    this.config = config;

    if (!this.terminal) {
      return;
    }

    applyTerminalAppearance(this.terminal, {
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      theme: config.theme,
    });

    if (this.installedGuardFactory !== config.installTerminalGuards) {
      this.guardCleanup?.();
      this.guardCleanup = (config.installTerminalGuards?.(this.terminal) ?? null) as (() => void) | null;
      this.installedGuardFactory = config.installTerminalGuards;
    }

    this.refit();
    this.syncFocus();
  }

  attach(attachment: PersistentTerminalAttachment): void {
    this.attachment = attachment;
    this.ensureTerminal();

    if (this.host.parentElement !== attachment.container || attachment.container.childNodes.length !== 1) {
      attachment.container.replaceChildren(this.host);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.refit();
    });
    this.resizeObserver.observe(attachment.container);

    this.refit();
    this.syncFocus();
  }

  detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.host.parentElement) {
      this.host.parentElement.removeChild(this.host);
    }

    this.attachment = null;
  }

  dispose(): void {
    this.detach();
    this.disposeTerminalInstance();
    this.pendingWrites = "";
  }

  hardReset(): void {
    this.disposeTerminalInstance();
    this.pendingWrites = "";
    this.ensureTerminal();
    this.refit();
    this.syncFocus();
  }

  private disposeTerminalInstance(): void {
    this.guardCleanup?.();
    this.guardCleanup = null;
    this.dataDisposable?.dispose();
    this.resizeDisposable?.dispose();
    this.scrollDisposable?.dispose();
    this.imeGuard?.dispose();
    this.dataDisposable = null;
    this.resizeDisposable = null;
    this.scrollDisposable = null;
    this.imeGuard = null;
    this.fitAddon = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.host.replaceChildren();
  }

  private ensureTerminal(): void {
    if (this.terminal) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: this.config.fontFamily,
      fontSize: this.config.fontSize,
      lineHeight: 1.3,
      theme: this.config.theme,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(this.host);

    this.dataDisposable = terminal.onData((data) => {
      void this.config.write(data);
    });
    this.resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void this.config.resize(cols, rows);
    });
    this.scrollDisposable = terminal.onScroll((position) => {
      updateViewport(this.tabId, position);
    });
    this.imeGuard = terminal.textarea
      ? createImeTextareaGuard(terminal.textarea, {
          onPasteText: (text) => terminal.paste(text),
        })
      : null;
    this.guardCleanup = (this.config.installTerminalGuards?.(terminal) ?? null) as (() => void) | null;
    this.installedGuardFactory = this.config.installTerminalGuards;

    this.terminal = terminal;
    this.fitAddon = fitAddon;

    if (this.pendingWrites.length > 0) {
      terminal.write(this.pendingWrites);
      this.pendingWrites = "";
    }
  }

  private refit(): void {
    if (!this.terminal || !this.fitAddon || !this.attachment) {
      return;
    }

    this.fitAddon.fit();
    void this.config.resize(this.terminal.cols, this.terminal.rows);
  }

  private syncFocus(): void {
    if (!this.terminal || !this.attachment) {
      return;
    }

    if (this.attachment.inputSuspended || !this.attachment.isActive) {
      this.terminal.textarea?.blur();
      return;
    }

    queueMicrotask(() => {
      this.terminal?.focus();
    });
  }
}

const runtimes = new Map<string, PersistentTerminalRuntime>();

export function ensurePersistentTerminalRuntime(
  tabId: string,
  config: PersistentTerminalRuntimeConfig,
): PersistentTerminalRuntime {
  const existing = runtimes.get(tabId);
  if (existing) {
    existing.updateConfig(config);
    return existing;
  }

  const runtime = new PersistentTerminalRuntime(tabId, config);
  runtimes.set(tabId, runtime);
  return runtime;
}

export function getPersistentTerminalRuntime(tabId: string): PersistentTerminalRuntime | null {
  return runtimes.get(tabId) ?? null;
}

export function disposePersistentTerminalRuntime(tabId: string): void {
  const runtime = runtimes.get(tabId);
  if (!runtime) {
    return;
  }

  runtime.dispose();
  runtimes.delete(tabId);
}

export function hardResetPersistentTerminalRuntime(tabId: string): void {
  const runtime = runtimes.get(tabId);
  runtime?.hardReset();
}

export function clearPersistentTerminalRuntimes(): void {
  for (const runtime of runtimes.values()) {
    runtime.dispose();
  }

  runtimes.clear();
}
