import { describe, expect, it } from "vitest";

import { normalizeWindowSnapshot } from "./restore";

describe("normalizeWindowSnapshot", () => {
  it("normalizes a window snapshot around layout-backed tab regions", () => {
    expect(
      normalizeWindowSnapshot({
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
          {
            tabId: "tab:orphan",
            title: "Orphan",
            shell: "/bin/bash",
            cwd: "~",
          },
        ],
        activeTabId: "tab:missing",
        nextTabNumber: 5,
      }),
    ).toEqual({
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
      activeTabId: "tab:1",
      nextTabNumber: 5,
    });
  });

  it("lifts panes from the active legacy workspace into sibling tabs", () => {
    expect(
      normalizeWindowSnapshot({
        tabs: [
          {
            tabId: "tab:1",
            title: "Old 1",
            workspace: {
              layout: {
                kind: "split",
                id: "split:legacy",
                axis: "horizontal",
                ratio: 0.5,
                first: {
                  kind: "leaf",
                  id: "layout:pane:main",
                  paneId: "pane:main",
                },
                second: {
                  kind: "leaf",
                  id: "layout:pane:2",
                  paneId: "pane:2",
                },
              },
              activePaneId: "pane:2",
              nextPaneNumber: 3,
              panes: [
                {
                  paneId: "pane:main",
                  title: "Main",
                  shell: "/bin/bash",
                  cwd: "/home/zpc",
                },
                {
                  paneId: "pane:2",
                  title: "Build",
                  shell: "/usr/bin/zsh",
                  cwd: "/tmp/build",
                },
              ],
            },
          },
          {
            tabId: "tab:2",
            title: "Old 2",
            workspace: {
              layout: {
                kind: "leaf",
                id: "layout:pane:3",
                paneId: "pane:3",
              },
              activePaneId: "pane:3",
              nextPaneNumber: 4,
              panes: [
                {
                  paneId: "pane:3",
                  title: "Ignored",
                  shell: "/bin/fish",
                  cwd: "/var/tmp",
                },
              ],
            },
          },
        ],
        tabOrder: ["tab:1", "tab:2"],
        activeTabId: "tab:1",
        nextTabNumber: 4,
      }),
    ).toEqual({
      layout: {
        kind: "split",
        id: "split:legacy",
        axis: "horizontal",
        ratio: 0.5,
        first: {
          kind: "leaf",
          id: "layout:pane:main",
          leafId: "tab:1",
        },
        second: {
          kind: "leaf",
          id: "layout:pane:2",
          leafId: "tab:2",
        },
      },
      tabs: [
        {
          tabId: "tab:1",
          title: "Main",
          shell: "/bin/bash",
          cwd: "/home/zpc",
        },
        {
          tabId: "tab:2",
          title: "Build",
          shell: "/usr/bin/zsh",
          cwd: "/tmp/build",
        },
      ],
      activeTabId: "tab:2",
      nextTabNumber: 4,
    });
  });

  it("returns null when layout references a missing tab", () => {
    expect(
      normalizeWindowSnapshot({
        layout: {
          kind: "leaf",
          id: "leaf:tab:1",
          leafId: "tab:1",
        },
        tabs: [],
        activeTabId: "tab:1",
        nextTabNumber: 2,
      }),
    ).toBeNull();
  });
});
