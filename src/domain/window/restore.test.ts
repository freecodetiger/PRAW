import { describe, expect, it } from "vitest";

import { normalizeWindowSnapshot } from "./restore";

describe("normalizeWindowSnapshot", () => {
  it("drops tabs not referenced by tabOrder and repairs an invalid activeTabId", () => {
    expect(
      normalizeWindowSnapshot({
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
            tabId: "tab:orphan",
            title: "Orphan",
            workspace: {
              layout: {
                kind: "leaf",
                id: "layout:pane:orphan",
                paneId: "pane:orphan",
              },
              activePaneId: "pane:orphan",
              nextPaneNumber: 2,
              panes: [
                {
                  paneId: "pane:orphan",
                  title: "Orphan",
                  shell: "/bin/bash",
                  cwd: "~",
                },
              ],
            },
          },
        ],
        tabOrder: ["tab:1"],
        activeTabId: "tab:missing",
        nextTabNumber: 4,
      }),
    ).toEqual({
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
      ],
      tabOrder: ["tab:1"],
      activeTabId: "tab:1",
      nextTabNumber: 4,
    });
  });

  it("returns null when every tab workspace is invalid", () => {
    expect(
      normalizeWindowSnapshot({
        tabs: [
          {
            tabId: "tab:1",
            title: "Broken",
            workspace: {
              layout: {
                kind: "leaf",
                id: "layout:pane:main",
                paneId: "pane:main",
              },
              activePaneId: "pane:main",
              nextPaneNumber: 2,
              panes: [],
            },
          },
        ],
        tabOrder: ["tab:1"],
        activeTabId: "tab:1",
        nextTabNumber: 2,
      }),
    ).toBeNull();
  });
});
