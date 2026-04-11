import { describe, expect, it } from "vitest";

import type { WindowModel } from "./types";
import { fromWindowSnapshot, toWindowSnapshot, type WindowSnapshot } from "./snapshot";

const windowModel: WindowModel = {
  layout: {
    kind: "split",
    id: "split:root",
    axis: "horizontal",
    ratio: 0.5,
    first: {
      kind: "leaf",
      id: "leaf:tab:1",
      leafId: "tab:1",
    },
    second: {
      kind: "leaf",
      id: "leaf:tab:2",
      leafId: "tab:2",
    },
  },
  tabs: {
    "tab:1": {
      tabId: "tab:1",
      title: "Main",
      shell: "/bin/bash",
      cwd: "~",
      status: "starting",
      exitCode: null,
      signal: null,
    },
    "tab:2": {
      tabId: "tab:2",
      title: "Build",
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
  it("serializes a window model to a window snapshot", () => {
    expect(toWindowSnapshot(windowModel)).toEqual({
      layout: {
        kind: "split",
        id: "split:root",
        axis: "horizontal",
        ratio: 0.5,
        first: {
          kind: "leaf",
          id: "leaf:tab:1",
          leafId: "tab:1",
        },
        second: {
          kind: "leaf",
          id: "leaf:tab:2",
          leafId: "tab:2",
        },
      },
      tabs: [
        {
          tabId: "tab:1",
          title: "Main",
          shell: "/bin/bash",
          cwd: "~",
        },
        {
          tabId: "tab:2",
          title: "Build",
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
      layout: {
        kind: "leaf",
        id: "leaf:tab:1",
        leafId: "tab:1",
      },
      tabs: [
        {
          tabId: "tab:1",
          title: "Main",
          shell: "/bin/bash",
          cwd: "~",
        },
      ],
      activeTabId: "tab:1",
      nextTabNumber: 2,
    };

    expect(fromWindowSnapshot(snapshot)).toEqual({
      layout: {
        kind: "leaf",
        id: "leaf:tab:1",
        leafId: "tab:1",
      },
      tabs: {
        "tab:1": {
          tabId: "tab:1",
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
      activeTabId: "tab:1",
      nextTabNumber: 2,
    });
  });
});
