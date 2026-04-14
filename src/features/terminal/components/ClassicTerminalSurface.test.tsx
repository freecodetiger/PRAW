// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";

const renderCalls: Array<{ installTerminalGuards: unknown }> = [];

vi.mock("./XtermTerminalSurface", () => ({
  XtermTerminalSurface: (props: { installTerminalGuards?: unknown }) => {
    renderCalls.push({
      installTerminalGuards: props.installTerminalGuards,
    });
    return null;
  },
}));

describe("ClassicTerminalSurface", () => {
  let host: HTMLDivElement;
  let root: Root;
  const theme = getThemePreset("dark").terminal;
  const write = vi.fn(async () => undefined);
  const resize = vi.fn(async () => undefined);

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    renderCalls.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps the terminal guard installer stable across rerenders", () => {
    act(() => {
      root.render(
        <ClassicTerminalSurface
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
    });

    const firstInstaller = renderCalls[renderCalls.length - 1]?.installTerminalGuards;

    act(() => {
      root.render(
        <ClassicTerminalSurface
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
    });

    const secondInstaller = renderCalls[renderCalls.length - 1]?.installTerminalGuards;
    expect(secondInstaller).toBe(firstInstaller);
  });
});
