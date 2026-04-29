// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { clearRegistry, exportTerminalArchive, getTerminalSnapshot, resetDirect, writeDirect } from "../lib/terminal-registry";
import { XtermTerminalSurface } from "./XtermTerminalSurface";

const { MockTerminal, MockUnicode11Addon, terminalInstances } = vi.hoisted(() => {
  const instances: Array<{
    focus: ReturnType<typeof vi.fn>;
    textarea: HTMLTextAreaElement;
    dispose: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>;
    write: ReturnType<typeof vi.fn>;
    completeNextWrite: () => void;
    clear: ReturnType<typeof vi.fn>;
    scrollToLine: ReturnType<typeof vi.fn>;
    scrollToBottom: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    loadAddon: ReturnType<typeof vi.fn>;
    unicode: {
      activeVersion: string;
      register: ReturnType<typeof vi.fn>;
    };
    _core: {
      unicodeService: {
        _activeProvider: { version: string; wcwidth: (codepoint: number) => 0 | 1 | 2; charProperties: () => number };
        _providers: Record<string, { version: string; wcwidth: (codepoint: number) => 0 | 1 | 2; charProperties: () => number }>;
      };
    };
    triggerScroll: (position: number) => void;
    buffer: {
      active: {
        viewportY: number;
        baseY: number;
        getLine: (index: number) => { translateToString: (trimRight?: boolean) => string } | undefined;
      };
    };
  }> = [];

  class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    textarea = document.createElement("textarea");
    focus = vi.fn();
    dispose = vi.fn();
    writeCallbacks: Array<() => void> = [];
    write = vi.fn((_data: string, callback?: () => void) => {
      if (callback) {
        this.writeCallbacks.push(callback);
      }
    });
    clear = vi.fn();
    scrollToLine = vi.fn();
    scrollToBottom = vi.fn();
    paste = vi.fn();
    getSelection = vi.fn(() => "");
    loadAddon = vi.fn();
    private unicode11Provider = {
      version: "11",
      wcwidth: (codepoint: number): 0 | 1 | 2 => (codepoint === 0x4e2d ? 2 : 1),
      charProperties: () => 2,
    };
    _core = {
      unicodeService: {
        _activeProvider: this.unicode11Provider,
        _providers: {
          "11": this.unicode11Provider,
        } as Record<string, typeof this.unicode11Provider>,
      },
    };
    unicode = {
      activeVersion: "6",
      register: vi.fn((provider: { version: string; wcwidth: (codepoint: number) => 0 | 1 | 2; charProperties: () => number }) => {
        this._core.unicodeService._providers[provider.version] = provider;
        this._core.unicodeService._activeProvider = provider;
      }),
    };
    instanceId = 0;
    open = vi.fn((element: HTMLElement) => {
      const marker = document.createElement("div");
      marker.dataset.terminalInstanceMarker = String(this.instanceId);
      marker.textContent = `terminal-${this.instanceId}`;
      element.appendChild(marker);
    });
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    onWriteParsed = vi.fn(() => ({ dispose: vi.fn() }));
    onScroll = vi.fn((callback: (position: number) => void) => {
      this.scrollListener = callback;
      return { dispose: vi.fn() };
    });
    buffer = {
      active: {
        viewportY: 0,
        baseY: 200,
        getLine: (_index: number) => undefined,
      },
    };
    private scrollListener: ((position: number) => void) | null = null;

    constructor() {
      this.instanceId = instances.length + 1;
      instances.push(this);
    }

    triggerScroll(position: number) {
      this.buffer.active.viewportY = position;
      this.scrollListener?.(position);
    }

    completeNextWrite() {
      this.writeCallbacks.shift()?.();
    }
  }

  class MockUnicode11Addon {
    readonly kind = "unicode11";
  }

  return { terminalInstances: instances, MockTerminal, MockUnicode11Addon };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
  },
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: MockUnicode11Addon,
}));


class FakeClipboardPasteEvent extends Event {
  readonly clipboardData: DataTransfer;
  stopImmediatePropagation = vi.fn();

  constructor(text: string) {
    super("paste", { cancelable: true });
    this.clipboardData = {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    } as DataTransfer;
  }
}

class FakeBeforeInputEvent extends Event {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing = false;
  stopImmediatePropagation = vi.fn();

  constructor(text: string) {
    super("beforeinput", { cancelable: true });
    this.data = text;
    this.inputType = "insertText";
  }
}

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe("XtermTerminalSurface", () => {
  let host: HTMLDivElement;
  let root: Root;
  const theme = getThemePreset("dark").terminal;
  const write = vi.fn(async () => undefined);
  const resize = vi.fn(async () => undefined);

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    terminalInstances.length = 0;
    clearRegistry();
    resetDirect("tab:1");
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it("focuses the active terminal when input is not suspended", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(terminalInstances[0]?.focus).toHaveBeenCalled();
  });

  it("loads the Unicode 11 width table before fitting the terminal", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const loadedAddons = terminalInstances[0]?.loadAddon.mock.calls.map(([addon]) => addon) ?? [];
    expect(loadedAddons.some((addon) => addon instanceof MockUnicode11Addon)).toBe(true);
    expect(terminalInstances[0]?.unicode.activeVersion).toBe("11");
    expect(terminalInstances[0]?.unicode.register).not.toHaveBeenCalled();
  });

  it("does not steal focus while terminal input is suspended", () => {
    act(() => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={true}
          write={write}
          resize={resize}
        />,
      );
    });

    expect(terminalInstances[0]?.focus).not.toHaveBeenCalled();
  });

  it("rehydrates buffered output when the same tab remounts", async () => {
    writeDirect("tab:1", "history line 1\nhistory line 2");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });
    await flushQueuedTerminalWrites();

    expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\nhistory line 2", expect.any(Function));

    act(() => {
      root.render(<div />);
    });

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });
    await flushQueuedTerminalWrites();

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\nhistory line 2", expect.any(Function));
  });

  it("coalesces high-frequency direct writes and waits for xterm parse callbacks", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(
          <XtermTerminalSurface
            tabId="tab:1"
            sessionId="session-1"
            fontFamily="monospace"
            fontSize={14}
            theme={theme}
            isActive={true}
            inputSuspended={false}
            write={write}
            resize={resize}
          />,
        );
        await Promise.resolve();
      });

      const terminal = terminalInstances[0];
      terminal?.write.mockClear();

      writeDirect("tab:1", "a");
      writeDirect("tab:1", "b");
      writeDirect("tab:1", "c");

      expect(terminal?.write).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(terminal?.write).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(15);
      });

      expect(terminal?.write).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(terminal?.write).toHaveBeenCalledTimes(1);
      expect(terminal?.write).toHaveBeenCalledWith("abc", expect.any(Function));

      writeDirect("tab:1", "d");
      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(terminal?.write).toHaveBeenCalledTimes(1);

      act(() => {
        terminal?.completeNextWrite();
        vi.runOnlyPendingTimers();
      });

      expect(terminal?.write).toHaveBeenCalledTimes(2);
      expect(terminal?.write).toHaveBeenLastCalledWith("d", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("splits large direct writes into small parser batches", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(
          <XtermTerminalSurface
            tabId="tab:1"
            sessionId="session-1"
            fontFamily="monospace"
            fontSize={14}
            theme={theme}
            isActive={true}
            inputSuspended={false}
            write={write}
            resize={resize}
          />,
        );
        await Promise.resolve();
      });

      const terminal = terminalInstances[0];
      terminal?.write.mockClear();

      writeDirect("tab:1", "x".repeat(5000));

      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(terminal?.write).toHaveBeenCalledTimes(1);
      expect(terminal?.write.mock.calls[0]?.[0]).toHaveLength(2048);

      act(() => {
        terminal?.completeNextWrite();
        vi.advanceTimersByTime(16);
      });

      expect(terminal?.write).toHaveBeenCalledTimes(2);
      expect(terminal?.write.mock.calls[1]?.[0]).toHaveLength(2048);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes native textarea paste through terminal.paste before xterm consumes textarea residue", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const event = new FakeClipboardPasteEvent("fas");
    terminalInstances[0]?.textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(terminalInstances[0]?.paste).toHaveBeenCalledWith("fas");
  });

  it("sends Chinese smart quotes directly to the PTY before xterm consumes the textarea event", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const event = new FakeBeforeInputEvent("“");
    terminalInstances[0]?.textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("“");
  });

  it("sends Chinese smart quote pairs atomically without adding terminal cursor movement", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const event = new FakeBeforeInputEvent("“”");
    terminalInstances[0]?.textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("“”");
  });

  it("clears stale terminal host DOM when the runtime is hard-reset", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(host.querySelectorAll("[data-terminal-instance-marker]")).toHaveLength(1);

    const { hardResetTerminalRuntime } = await import("../lib/terminal-registry");
    hardResetTerminalRuntime("tab:1");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const markers = host.querySelectorAll("[data-terminal-instance-marker]");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.textContent).toBe("terminal-2");
  });

  it("creates a new terminal instance only when the runtime is explicitly hard-reset", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const { hardResetTerminalRuntime } = await import("../lib/terminal-registry");
    const firstInstance = terminalInstances[0];

    hardResetTerminalRuntime("tab:1");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(terminalInstances).toHaveLength(2);
    expect(terminalInstances[1]).not.toBe(firstInstance);
  });

  it("reuses the same terminal instance when the same tab remounts", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const firstInstance = terminalInstances[0];
    expect(firstInstance).toBeDefined();

    act(() => {
      root.render(<div />);
    });

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]).toBe(firstInstance);
  });

  it("keeps receiving PTY output while detached and shows it again after remount without replaying a new instance", async () => {
    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const firstInstance = terminalInstances[0];
    expect(firstInstance).toBeDefined();

    act(() => {
      root.render(<div />);
    });

    writeDirect("tab:1", "detached output");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });
    await flushQueuedTerminalWrites();

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]).toBe(firstInstance);
    expect(firstInstance?.write).toHaveBeenCalledWith("detached output", expect.any(Function));
  });

  it("preserves the existing viewport when the terminal remounts", async () => {
    writeDirect("tab:1", "history line 1\nhistory line 2");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    const firstInstance = terminalInstances[0];

    act(() => {
      firstInstance?.triggerScroll(37);
    });

    act(() => {
      root.render(<div />);
    });

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          inputSuspended={false}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]).toBe(firstInstance);
    expect(firstInstance?.buffer.active.viewportY).toBe(37);
  });

  it("exports mirror-owned terminal text without depending on writeParsed callbacks", async () => {
    writeDirect("tab:1", "mirror owned output");

    await act(async () => {
      root.render(
        <XtermTerminalSurface
          tabId="tab:1"
          sessionId="session-1"
          fontFamily="monospace"
          fontSize={14}
          theme={theme}
          isActive={true}
          write={write}
          resize={resize}
        />,
      );
      await Promise.resolve();
    });

    expect(exportTerminalArchive("tab:1")).toBe("mirror owned output");
  });

  it("keeps replay snapshot and archive export derived from the same mirror state", () => {
    writeDirect("tab:1", "line 1\nline 2\n");

    expect(getTerminalSnapshot("tab:1")).toEqual({
      content: "line 1\nline 2\n",
      viewportY: 0,
      archiveText: "line 1\nline 2",
    });
    expect(exportTerminalArchive("tab:1")).toBe("line 1\nline 2");
  });
});

async function flushQueuedTerminalWrites() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
