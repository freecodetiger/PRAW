// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { clearRegistry, exportTerminalArchive, getTerminalSnapshot, resetDirect, writeDirect } from "../lib/terminal-registry";
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
    write = vi.fn();
    clear = vi.fn();
    scrollToLine = vi.fn();
    scrollToBottom = vi.fn();
    paste = vi.fn();
    getSelection = vi.fn(() => "");
    loadAddon = vi.fn();
    open = vi.fn();
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

    expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\nhistory line 2");

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
    expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\nhistory line 2");
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

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]).toBe(firstInstance);
    expect(firstInstance?.write).toHaveBeenCalledWith("detached output");
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
