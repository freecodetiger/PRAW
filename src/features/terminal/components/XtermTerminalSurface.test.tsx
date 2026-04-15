// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { clearRegistry, resetDirect, writeDirect } from "../lib/terminal-registry";
import { XtermTerminalSurface } from "./XtermTerminalSurface";

const { MockTerminal, terminalInstances } = vi.hoisted(() => {
  const instances: Array<{
    focus: ReturnType<typeof vi.fn>;
    textarea: HTMLTextAreaElement;
    dispose: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>;
    write: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    scrollToLine: ReturnType<typeof vi.fn>;
    scrollToBottom: ReturnType<typeof vi.fn>;
    triggerScroll: (position: number) => void;
    buffer: {
      active: {
        viewportY: number;
        baseY: number;
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
    write = vi.fn();
    clear = vi.fn();
    scrollToLine = vi.fn();
    scrollToBottom = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    onScroll = vi.fn((callback: (position: number) => void) => {
      this.scrollListener = callback;
      return { dispose: vi.fn() };
    });
    buffer = {
      active: {
        viewportY: 0,
        baseY: 200,
      },
    };
    private scrollListener: ((position: number) => void) | null = null;

    constructor() {
      instances.push(this);
    }

    triggerScroll(position: number) {
      this.buffer.active.viewportY = position;
      this.scrollListener?.(position);
    }
  }

  return { terminalInstances: instances, MockTerminal };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
  },
}));

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

  it("focuses the active terminal when input is not suspended", () => {
    act(() => {
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
    });

    expect(terminalInstances[0]?.focus).toHaveBeenCalled();
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
    writeDirect("tab:1", "history line 1\r\nhistory line 2");

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

    expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\r\nhistory line 2");

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

    expect(terminalInstances[1]?.write).toHaveBeenCalledWith("history line 1\r\nhistory line 2");
  });

  it("restores the previous viewport line when the terminal remounts", async () => {
    writeDirect("tab:1", "history line 1\r\nhistory line 2");

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

    act(() => {
      terminalInstances[0]?.triggerScroll(37);
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

    expect(terminalInstances[1]?.scrollToLine).toHaveBeenCalledWith(37);
  });
});
