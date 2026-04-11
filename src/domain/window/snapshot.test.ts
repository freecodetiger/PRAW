import { describe, expect, it } from "vitest";

import type { WindowModel } from "./types";
import { WINDOW_SNAPSHOT_VERSION, fromWindowSnapshot, toWindowSnapshot, type WindowSnapshot } from "./snapshot";

const windowModel: WindowModel = {
  layout: {
    kind: "container",
    id: "container:root",
    axis: "horizontal",
    sizes: [1, 1],
    children: [
      {
        kind: "pane",
        id: "pane:tab:1",
        paneId: "tab:1",
      },
      {
        kind: "pane",
        id: "pane:tab:2",
        paneId: "tab:2",
      },
    ],
  },
  tabs: {
    "tab:1": {
      tabId: "tab:1",
      title: "Tab 1",
      note: "Build",
      shell: "/bin/bash",
      cwd: "~",
      status: "starting",
      exitCode: null,
      signal: null,
    },
    "tab:2": {
      tabId: "tab:2",
      title: "Tab 2",
      shell: "/usr/bin/zsh",
      cwd: "/tmp",
      status: "running",
      sessionId: "session:2",
      exitCode: null,
      signal: null,
    },
  },
  activeTabId: "tab:2",
  nextTabNumber: 3,
};

describe("window snapshot", () => {
  it("serializes a window model to a versioned window snapshot", () => {
    expect(toWindowSnapshot(windowModel)).toEqual({
      version: WINDOW_SNAPSHOT_VERSION,
      layout: {
        kind: "container",
        id: "container:root",
        axis: "horizontal",
        sizes: [1, 1],
        children: [
          {
            kind: "pane",
            id: "pane:tab:1",
            paneId: "tab:1",
          },
          {
            kind: "pane",
            id: "pane:tab:2",
            paneId: "tab:2",
          },
        ],
      },
      tabs: [
        {
          tabId: "tab:1",
          title: "Tab 1",
          note: "Build",
          shell: "/bin/bash",
          cwd: "~",
        },
        {
          tabId: "tab:2",
          title: "Tab 2",
          shell: "/usr/bin/zsh",
          cwd: "/tmp",
        },
      ],
      activeTabId: "tab:2",
      nextTabNumber: 3,
    });
  });

  it("rehydrates snapshots into runtime models with tabs in starting state", () => {
    const snapshot: WindowSnapshot = {
      version: WINDOW_SNAPSHOT_VERSION,
      layout: {
        kind: "pane",
        id: "pane:tab:1",
        paneId: "tab:1",
      },
      tabs: [
        {
          tabId: "tab:1",
          title: "Tab 1",
          note: "Build",
          shell: "/bin/bash",
          cwd: "~",
        },
      ],
      activeTabId: "tab:1",
      nextTabNumber: 2,
    };

    expect(fromWindowSnapshot(snapshot)).toEqual({
      layout: {
        kind: "pane",
        id: "pane:tab:1",
        paneId: "tab:1",
      },
      tabs: {
        "tab:1": {
          tabId: "tab:1",
          title: "Tab 1",
          note: "Build",
          shell: "/bin/bash",
          cwd: "~",
          status: "starting",
          sessionId: undefined,
          error: undefined,
          exitCode: null,
          signal: null,
        },
      },
      activeTabId: "tab:1",
      nextTabNumber: 2,
    });
  });
});
