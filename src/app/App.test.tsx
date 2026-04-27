// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "../features/terminal/state/workspace-store";
import App from "./App";

const bootstrapApi = vi.hoisted(() => ({
  loadAppBootstrapState: vi.fn(async () => ({
    config: null,
    workspaceCollectionSnapshot: {
      version: 1 as const,
      activeWorkspaceId: "ws:1",
      nextWorkspaceNumber: 2,
      workspaces: [
        {
          workspaceId: "ws:1",
          title: "Workspace 1",
          createdAt: 1,
          updatedAt: 1,
          window: {
            version: 2 as const,
            layout: {
              kind: "container" as const,
              id: "root",
              axis: "horizontal" as const,
              children: [
                { kind: "pane" as const, id: "pane:ws:1:tab:1", paneId: "ws:1:tab:1" },
                { kind: "pane" as const, id: "pane:ws:1:tab:2", paneId: "ws:1:tab:2" },
              ],
              sizes: [1, 1],
            },
            tabs: [
              { tabId: "ws:1:tab:1", title: "Tab 1", shell: "/bin/bash", cwd: "/workspace" },
              { tabId: "ws:1:tab:2", title: "Tab 2", shell: "/bin/bash", cwd: "/workspace" },
            ],
            activeTabId: "ws:1:tab:2",
            nextTabNumber: 3,
          },
        },
      ],
    },
    windowSnapshot: null,
  })),
  saveAppConfig: vi.fn(async () => undefined),
  saveWorkspaceCollectionSnapshot: vi.fn(async () => undefined),
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
vi.mock("../features/timer/components/GlobalTimer", () => ({
  GlobalTimer: () => <div data-testid="global-timer" />,
}));

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    bootstrapApi.loadAppBootstrapState.mockClear();
    bootstrapApi.saveAppConfig.mockClear();
    bootstrapApi.saveWorkspaceCollectionSnapshot.mockClear();
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
      useWorkspaceStore.getState().enterFocusMode("ws:1:tab:2");
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(bootstrapApi.saveWorkspaceCollectionSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({
            window: expect.objectContaining({
              layout: {
                kind: "container",
                id: "root",
                axis: "horizontal",
                children: [
                  { kind: "pane", id: "pane:ws:1:tab:1", paneId: "ws:1:tab:1" },
                  { kind: "pane", id: "pane:ws:1:tab:2", paneId: "ws:1:tab:2" },
                ],
                sizes: [1, 1],
              },
              activeTabId: "ws:1:tab:2",
            }),
          }),
        ],
      }),
    );
  });

  it("uses the top-left workspace logo button instead of the PRAW brand text", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    const header = host.querySelector(".app-header");
    const workspaceButton = header?.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']");

    expect(header?.querySelector("h1")).toBeNull();
    expect(header?.textContent).not.toContain("PRAW");
    expect(workspaceButton).not.toBeNull();

    act(() => {
      workspaceButton?.click();
    });

    expect(host.querySelector(".workspace-switcher-panel--open")).not.toBeNull();
  });

  it("renders the global timer in the center of the app header", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    const headerCenter = host.querySelector(".app-header__center");

    expect(headerCenter).not.toBeNull();
    expect(headerCenter!.querySelector("[data-testid='global-timer']")).not.toBeNull();
    expect(host.querySelector(".app-header__actions [data-testid='settings-panel']")).not.toBeNull();
    expect(host.querySelector(".app-header [aria-label='Open workspaces']")).not.toBeNull();
  });

  it("migrates a legacy window snapshot into a workspace collection", async () => {
    bootstrapApi.loadAppBootstrapState.mockResolvedValueOnce({
      config: null,
      workspaceCollectionSnapshot: null,
      windowSnapshot: {
        version: 2 as const,
        layout: { kind: "pane" as const, id: "pane:tab:1", paneId: "tab:1" },
        tabs: [{ tabId: "tab:1", title: "Tab 1", shell: "/bin/bash", cwd: "/workspace" }],
        activeTabId: "tab:1",
        nextTabNumber: 2,
      },
    } as any);

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:1");
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:1");
  });
});
