// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "../features/terminal/state/workspace-store";
import App from "./App";

const bootstrapApi = vi.hoisted(() => ({
  loadAppBootstrapState: vi.fn(async () => ({
    config: null,
    windowSnapshot: {
      version: 2 as const,
      layout: {
        kind: "container" as const,
        id: "root",
        axis: "horizontal" as const,
        children: [
          { kind: "pane" as const, id: "pane:tab:1", paneId: "tab:1" },
          { kind: "pane" as const, id: "pane:tab:2", paneId: "tab:2" },
        ],
        sizes: [1, 1],
      },
      tabs: [
        { tabId: "tab:1", title: "Tab 1", shell: "/bin/bash", cwd: "/workspace" },
        { tabId: "tab:2", title: "Tab 2", shell: "/bin/bash", cwd: "/workspace" },
      ],
      activeTabId: "tab:2",
      nextTabNumber: 3,
    },
  })),
  saveAppConfig: vi.fn(async () => undefined),
  saveWindowSnapshot: vi.fn(async () => undefined),
}));

vi.mock("../lib/tauri/bootstrap", () => bootstrapApi);
vi.mock("../features/terminal/hooks/useTerminalRuntime", () => ({
  useTerminalRuntime: () => undefined,
}));
vi.mock("../features/config/components/SettingsPanel", () => ({
  SettingsPanel: () => <div data-testid="settings-panel" />,
}));
vi.mock("../features/terminal/components/TerminalWorkspace", () => ({
  TerminalWorkspace: () => <div data-testid="workspace" />,
}));

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    bootstrapApi.loadAppBootstrapState.mockClear();
    bootstrapApi.saveAppConfig.mockClear();
    bootstrapApi.saveWindowSnapshot.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  });

  it("persists the pre-focus layout even while focus mode is active", async () => {
    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useWorkspaceStore.getState().enterFocusMode("tab:2");
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(bootstrapApi.saveWindowSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layout: {
          kind: "container",
          id: "root",
          axis: "horizontal",
          children: [
            { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
            { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
          ],
          sizes: [1, 1],
        },
        activeTabId: "tab:2",
      }),
    );
  });
});
