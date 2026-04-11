import { describe, expect, it } from "vitest";

import type { WorkspaceSnapshot } from "./snapshot";
import { normalizeWorkspaceSnapshot } from "./restore";

const baseLayout = {
  kind: "container" as const,
  id: "container:root",
  axis: "horizontal" as const,
  sizes: [1, 1],
  children: [
    {
      kind: "pane" as const,
      id: "pane:main",
      paneId: "pane:main",
    },
    {
      kind: "pane" as const,
      id: "pane:2",
      paneId: "pane:2",
    },
  ],
};

const baseSnapshot: WorkspaceSnapshot = {
  layout: baseLayout,
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
        panes: baseSnapshot.panes.filter((pane) => pane.paneId === "pane:main"),
      }),
    ).toBeNull();
  });

  it("returns null instead of throwing on structurally malformed persisted data", () => {
    const malformedSnapshot = {
      ...baseSnapshot,
      layout: {
        ...baseLayout,
        children: [baseLayout.children[0], null],
      },
      panes: [null],
    } as unknown as WorkspaceSnapshot;

    expect(() => normalizeWorkspaceSnapshot(malformedSnapshot)).not.toThrow();
    expect(normalizeWorkspaceSnapshot(malformedSnapshot)).toBeNull();
  });
});
