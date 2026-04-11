import { describe, expect, it } from "vitest";

import { WINDOW_SNAPSHOT_VERSION } from "./snapshot";
import { normalizeWindowSnapshot } from "./restore";

describe("normalizeWindowSnapshot", () => {
  it("normalizes a versioned window snapshot around layout-backed tab regions", () => {
    expect(
      normalizeWindowSnapshot({
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
      activeTabId: "tab:1",
      nextTabNumber: 5,
    });
  });

  it("defaults a missing note to undefined when normalizing snapshots", () => {
    expect(
      normalizeWindowSnapshot({
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
            shell: "/bin/bash",
            cwd: "~",
          },
        ],
        activeTabId: "tab:1",
        nextTabNumber: 2,
      }),
    ).toEqual({
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
          note: undefined,
          shell: "/bin/bash",
          cwd: "~",
        },
      ],
      activeTabId: "tab:1",
      nextTabNumber: 2,
    });
  });

  it("returns null when layout references a missing tab", () => {
    expect(
      normalizeWindowSnapshot({
        version: WINDOW_SNAPSHOT_VERSION,
        layout: {
          kind: "pane",
          id: "pane:tab:1",
          paneId: "tab:1",
        },
        tabs: [],
        activeTabId: "tab:1",
        nextTabNumber: 2,
      }),
    ).toBeNull();
  });

  it("rejects legacy unversioned snapshots so the app can reset them", () => {
    expect(
      normalizeWindowSnapshot({
        layout: {
          kind: "leaf",
          id: "leaf:tab:1",
          leafId: "tab:1",
        },
        tabs: [],
      }),
    ).toBeNull();
  });
});
