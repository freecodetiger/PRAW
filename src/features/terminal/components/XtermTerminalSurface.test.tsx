// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { XtermTerminalSurface } from "./XtermTerminalSurface";

const { MockTerminal, terminalInstances } = vi.hoisted(() => {
  const instances: Array<{ focus: ReturnType<typeof vi.fn>; textarea: HTMLTextAreaElement; dispose: ReturnType<typeof vi.fn>; options: Record<string, unknown> }> = [];

  class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    textarea = document.createElement("textarea");
    focus = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));

    constructor() {
      instances.push(this);
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
});
