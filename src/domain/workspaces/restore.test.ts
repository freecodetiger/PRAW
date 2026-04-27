import { describe, expect, it } from "vitest";

import { collectLeafIds } from "../layout/tree";
import { normalizeWorkspaceCollectionSnapshot, windowSnapshotToWorkspaceCollectionSnapshot } from "./restore";
import type { WorkspaceCollectionSnapshot } from "./snapshot";

const legacyWindowSnapshot = {
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
    { tabId: "tab:1", title: "Tab 1", note: "api", shell: "/bin/bash", cwd: "/workspace" },
    { tabId: "tab:2", title: "Tab 2", shell: "/bin/zsh", cwd: "/workspace/ui" },
  ],
  activeTabId: "tab:2",
  nextTabNumber: 3,
};

describe("normalizeWorkspaceCollectionSnapshot", () => {
  it("migrates a legacy window snapshot into a namespaced first workspace", () => {
    const collection = windowSnapshotToWorkspaceCollectionSnapshot(legacyWindowSnapshot, 1000);

    expect(collection).toMatchObject({
      version: 1,
      activeWorkspaceId: "ws:1",
      nextWorkspaceNumber: 2,
      workspaces: [
        {
          workspaceId: "ws:1",
          title: "Workspace 1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    expect(collectLeafIds(collection!.workspaces[0].window.layout)).toEqual(["ws:1:tab:1", "ws:1:tab:2"]);
    expect(collection!.workspaces[0].window.tabs.map((tab) => tab.tabId)).toEqual(["ws:1:tab:1", "ws:1:tab:2"]);
    expect(collection!.workspaces[0].window.activeTabId).toBe("ws:1:tab:2");
    expect(collection!.workspaces[0].window.tabs[0].note).toBe("api");
  });

  it("repairs an invalid active workspace and rejects duplicate tab ids across workspaces", () => {
    const snapshot: WorkspaceCollectionSnapshot = {
      version: 1,
      activeWorkspaceId: "missing",
      nextWorkspaceNumber: 3,
      workspaces: [
        {
          workspaceId: "ws:1",
          title: "One",
          createdAt: 10,
          updatedAt: 10,
          window: {
            ...legacyWindowSnapshot,
            layout: { kind: "pane", id: "pane:dup", paneId: "dup" },
            tabs: [{ tabId: "dup", title: "Dup", shell: "/bin/bash", cwd: "/a" }],
            activeTabId: "dup",
            nextTabNumber: 2,
          },
        },
        {
          workspaceId: "ws:2",
          title: "Two",
          createdAt: 11,
          updatedAt: 11,
          window: {
            ...legacyWindowSnapshot,
            layout: { kind: "pane", id: "pane:dup", paneId: "dup" },
            tabs: [{ tabId: "dup", title: "Dup", shell: "/bin/bash", cwd: "/b" }],
            activeTabId: "dup",
            nextTabNumber: 2,
          },
        },
      ],
    };

    expect(normalizeWorkspaceCollectionSnapshot({ ...snapshot, workspaces: [snapshot.workspaces[0]] })?.activeWorkspaceId).toBe(
      "ws:1",
    );
    expect(normalizeWorkspaceCollectionSnapshot(snapshot)).toBeNull();
  });

  it("returns null for empty or malformed collection data", () => {
    expect(normalizeWorkspaceCollectionSnapshot(null)).toBeNull();
    expect(normalizeWorkspaceCollectionSnapshot({ version: 1, workspaces: [] })).toBeNull();
    expect(normalizeWorkspaceCollectionSnapshot({ version: 1, workspaces: [{ workspaceId: "", window: null }] })).toBeNull();
  });
});
