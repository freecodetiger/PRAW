import { describe, expect, it } from "vitest";

import { fromWorkspaceSnapshot } from "../workspace/snapshot";
import type { WindowModel } from "./types";
import { fromWindowSnapshot, toWindowSnapshot, type WindowSnapshot } from "./snapshot";

const workspaceMain = fromWorkspaceSnapshot({
  layout: {
    kind: "leaf",
    id: "layout:pane:main",
    paneId: "pane:main",
  },
  activePaneId: "pane:main",
  nextPaneNumber: 2,
  panes: [
    {
      paneId: "pane:main",
      title: "Main",
      shell: "/bin/bash",
      cwd: "~",
    },
  ],
});

const windowModel: WindowModel = {
  tabs: {
    "tab:1": {
      tabId: "tab:1",
      title: "Tab 1",
      workspace: workspaceMain,
    },
    "tab:2": {
      tabId: "tab:2",
      title: "Tab 2",
      workspace: {
        ...workspaceMain,
        activePaneId: "pane:2",
        nextPaneNumber: 3,
        panes: {
          "pane:2": {
            paneId: "pane:2",
            title: "Pane 2",
            shell: "/usr/bin/zsh",
            cwd: "/tmp",
            status: "starting",
            exitCode: null,
            signal: null,
          },
        },
        layout: {
          kind: "leaf",
          id: "layout:pane:2",
          paneId: "pane:2",
        },
      },
    },
  },
  tabOrder: ["tab:1", "tab:2"],
  activeTabId: "tab:2",
  nextTabNumber: 3,
};

describe("window snapshot", () => {
  it("serializes a window model to a window snapshot", () => {
    expect(toWindowSnapshot(windowModel)).toEqual({
      tabs: [
        {
          tabId: "tab:1",
          title: "Tab 1",
          workspace: {
            layout: {
              kind: "leaf",
              id: "layout:pane:main",
              paneId: "pane:main",
            },
            activePaneId: "pane:main",
            nextPaneNumber: 2,
            panes: [
              {
                paneId: "pane:main",
                title: "Main",
                shell: "/bin/bash",
                cwd: "~",
              },
            ],
          },
        },
        {
          tabId: "tab:2",
          title: "Tab 2",
          workspace: {
            layout: {
              kind: "leaf",
              id: "layout:pane:2",
              paneId: "pane:2",
            },
            activePaneId: "pane:2",
            nextPaneNumber: 3,
            panes: [
              {
                paneId: "pane:2",
                title: "Pane 2",
                shell: "/usr/bin/zsh",
                cwd: "/tmp",
              },
            ],
          },
        },
      ],
      tabOrder: ["tab:1", "tab:2"],
      activeTabId: "tab:2",
      nextTabNumber: 3,
    });
  });

  it("rehydrates snapshots into runtime models with panes in starting state", () => {
    const snapshot: WindowSnapshot = {
      tabs: [
        {
          tabId: "tab:1",
          title: "Main",
          workspace: {
            layout: {
              kind: "leaf",
              id: "layout:pane:main",
              paneId: "pane:main",
            },
            activePaneId: "pane:main",
            nextPaneNumber: 2,
            panes: [
              {
                paneId: "pane:main",
                title: "Main",
                shell: "/bin/bash",
                cwd: "~",
              },
            ],
          },
        },
      ],
      tabOrder: ["tab:1"],
      activeTabId: "tab:1",
      nextTabNumber: 2,
    };

    expect(fromWindowSnapshot(snapshot)).toEqual({
      tabs: {
        "tab:1": {
          tabId: "tab:1",
          title: "Main",
          workspace: {
            layout: {
              kind: "leaf",
              id: "layout:pane:main",
              paneId: "pane:main",
            },
            activePaneId: "pane:main",
            nextPaneNumber: 2,
            panes: {
              "pane:main": {
                paneId: "pane:main",
                title: "Main",
                shell: "/bin/bash",
                cwd: "~",
                status: "starting",
                sessionId: undefined,
                error: undefined,
                exitCode: null,
                signal: null,
              },
            },
          },
        },
      },
      tabOrder: ["tab:1"],
      activeTabId: "tab:1",
      nextTabNumber: 2,
    });
  });
});
