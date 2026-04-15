// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { LiveCommandConsole } from "./LiveCommandConsole";

const renderCalls: Array<{ inputSuspended?: boolean }> = [];

vi.mock("./XtermTerminalSurface", () => ({
  XtermTerminalSurface: (props: { inputSuspended?: boolean }) => {
    renderCalls.push({
      inputSuspended: props.inputSuspended,
    });
    return null;
  },
}));

describe("LiveCommandConsole", () => {
  let host: HTMLDivElement;
  let root: Root;

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

  it("forwards inputSuspended to the live xterm surface", () => {
    act(() => {
      root.render(
        <LiveCommandConsole
          tabId="tab:1"
          sessionId="session-1"
          command="codex"
          cwd="/workspace"
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          compact={false}
          heightPx={240}
          inputSuspended={true}
          write={async () => undefined}
          resize={async () => undefined}
        />,
      );
    });

    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(true);
  });
});
