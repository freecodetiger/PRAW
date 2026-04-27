// @vitest-environment jsdom

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "../state/workspace-store";
import { useTerminalSession } from "./useTerminalSession";

const terminalApi = vi.hoisted(() => ({
  closeTerminalSession: vi.fn(async () => undefined),
  resizeTerminalSession: vi.fn(async () => undefined),
  writeTerminalSession: vi.fn(async () => undefined),
}));

vi.mock("../../../lib/tauri/terminal", () => ({
  closeTerminalSession: terminalApi.closeTerminalSession,
  resizeTerminalSession: terminalApi.resizeTerminalSession,
  writeTerminalSession: terminalApi.writeTerminalSession,
}));

function Child({ resize }: { resize: (cols: number, rows: number) => Promise<void> }) {
  useEffect(() => {
    void resize(132, 43);
  }, [resize]);

  return null;
}

function Parent() {
  const { resize } = useTerminalSession("tab:1");
  return <Child resize={resize} />;
}

describe("useTerminalSession", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    terminalApi.closeTerminalSession.mockClear();
    terminalApi.resizeTerminalSession.mockClear();
    terminalApi.writeTerminalSession.mockClear();

    useWorkspaceStore.setState((state) => ({
      ...state,
      window: {
        layout: {
          kind: "pane",
          id: "pane:tab:1",
          paneId: "tab:1",
        },
        tabs: {
          "tab:1": {
            tabId: "tab:1",
            title: "Tab 1",
            shell: "/bin/zsh",
            cwd: "/workspace",
            status: "running",
            sessionId: "session-1",
          },
        },
        activeTabId: "tab:1",
        nextTabNumber: 2,
      },
    }));

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

  it("routes immediate child resize effects to the current session", async () => {
    await act(async () => {
      root.render(<Parent />);
      await Promise.resolve();
    });

    expect(terminalApi.resizeTerminalSession).toHaveBeenCalledWith("session-1", 132, 43);
  });
});
