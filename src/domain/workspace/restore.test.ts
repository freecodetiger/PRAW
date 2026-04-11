import { describe, expect, it } from "vitest";

import type { WorkspaceSnapshot } from "./snapshot";
import { normalizeWorkspaceSnapshot } from "./restore";

const baseSnapshot: WorkspaceSnapshot = {
  layout: {
    kind: "split",
    id: "split:root",
    axis: "horizontal",
    ratio: 0.5,
    first: {
      kind: "leaf",
      id: "leaf:main",
      paneId: "pane:main",
    },
    second: {
      kind: "leaf",
      id: "leaf:2",
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
      cwd: "~",
    },
    {
      paneId: "pane:2",
      title: "Pane 2",
      shell: "/bin/bash",
      cwd: "~",
    },
  ],
};

describe("normalizeWorkspaceSnapshot", () => {
  it("repairs an invalid active pane and drops panes not referenced by layout", () => {
    expect(
      normalizeWorkspaceSnapshot({
        ...baseSnapshot,
        activePaneId: "pane:missing",
        panes: [
          ...baseSnapshot.panes,
          {
            paneId: "pane:orphan",
            title: "Orphan",
            shell: "/bin/bash",
            cwd: "~",
          },
        ],
      }),
    ).toEqual({
      ...baseSnapshot,
      activePaneId: "pane:main",
      panes: baseSnapshot.panes,
    });
  });

  it("falls back to null when layout references a missing pane", () => {
    expect(
      normalizeWorkspaceSnapshot({
        ...baseSnapshot,
        panes: baseSnapshot.panes.filter((pane) => pane.paneId !== "pane:2"),
      }),
    ).toBeNull();
  });

  it("returns null instead of throwing on structurally malformed persisted data", () => {
    const malformedSnapshot = {
      ...baseSnapshot,
      layout: {
        ...baseSnapshot.layout,
        second: null,
      },
      panes: [null],
    } as unknown as WorkspaceSnapshot;

    expect(() => normalizeWorkspaceSnapshot(malformedSnapshot)).not.toThrow();
    expect(normalizeWorkspaceSnapshot(malformedSnapshot)).toBeNull();
  });
});
