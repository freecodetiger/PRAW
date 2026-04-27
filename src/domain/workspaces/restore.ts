import type { LayoutNode } from "../layout/types";
import { collectLeafIds } from "../layout/tree";
import { normalizeWindowSnapshot } from "../window/restore";
import { WINDOW_SNAPSHOT_VERSION, type WindowSnapshot } from "../window/snapshot";
import { WORKSPACE_COLLECTION_SNAPSHOT_VERSION, type WorkspaceCollectionSnapshot } from "./snapshot";

export function normalizeWorkspaceCollectionSnapshot(snapshot: unknown): WorkspaceCollectionSnapshot | null {
  if (
    !isRecord(snapshot) ||
    snapshot.version !== WORKSPACE_COLLECTION_SNAPSHOT_VERSION ||
    Array.isArray(snapshot.workspaces) === false ||
    snapshot.workspaces.length === 0
  ) {
    return null;
  }

  const workspaces: WorkspaceCollectionSnapshot["workspaces"] = [];
  const workspaceIds = new Set<string>();
  const tabIds = new Set<string>();

  for (const rawWorkspace of snapshot.workspaces) {
    const workspace = normalizeWorkspaceEntrySnapshot(rawWorkspace);
    if (!workspace) {
      continue;
    }

    if (workspaceIds.has(workspace.workspaceId)) {
      return null;
    }

    for (const tabId of collectLeafIds(workspace.window.layout)) {
      if (tabIds.has(tabId)) {
        return null;
      }
      tabIds.add(tabId);
    }

    workspaceIds.add(workspace.workspaceId);
    workspaces.push(workspace);
  }

  if (workspaces.length === 0) {
    return null;
  }

  const activeWorkspaceId =
    typeof snapshot.activeWorkspaceId === "string" && workspaceIds.has(snapshot.activeWorkspaceId)
      ? snapshot.activeWorkspaceId
      : workspaces[0].workspaceId;

  return {
    version: WORKSPACE_COLLECTION_SNAPSHOT_VERSION,
    activeWorkspaceId,
    nextWorkspaceNumber: inferNextWorkspaceNumber(snapshot.nextWorkspaceNumber, workspaces.map((workspace) => workspace.workspaceId)),
    workspaces,
  };
}

export function windowSnapshotToWorkspaceCollectionSnapshot(
  snapshot: unknown,
  timestamp = Date.now(),
): WorkspaceCollectionSnapshot | null {
  const window = normalizeWindowSnapshot(snapshot);
  if (!window) {
    return null;
  }

  return {
    version: WORKSPACE_COLLECTION_SNAPSHOT_VERSION,
    activeWorkspaceId: "ws:1",
    nextWorkspaceNumber: 2,
    workspaces: [
      {
        workspaceId: "ws:1",
        title: "Workspace 1",
        window: namespaceWindowSnapshot(window, "ws:1"),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

function normalizeWorkspaceEntrySnapshot(rawWorkspace: unknown): WorkspaceCollectionSnapshot["workspaces"][number] | null {
  if (!isRecord(rawWorkspace) || !isNonEmptyString(rawWorkspace.workspaceId)) {
    return null;
  }

  const window = normalizeWindowSnapshot(rawWorkspace.window);
  if (!window) {
    return null;
  }

  const createdAt = normalizeTimestamp(rawWorkspace.createdAt);
  const updatedAt = normalizeTimestamp(rawWorkspace.updatedAt) ?? createdAt ?? Date.now();

  return {
    workspaceId: rawWorkspace.workspaceId,
    title: isNonEmptyString(rawWorkspace.title) ? rawWorkspace.title.trim() : rawWorkspace.workspaceId,
    window,
    createdAt: createdAt ?? updatedAt,
    updatedAt,
  };
}

function namespaceWindowSnapshot(snapshot: WindowSnapshot, workspaceId: string): WindowSnapshot {
  const tabIdMap = new Map(snapshot.tabs.map((tab) => [tab.tabId, namespaceTabId(workspaceId, tab.tabId)]));

  return {
    version: WINDOW_SNAPSHOT_VERSION,
    layout: rewriteLayoutLeafIds(snapshot.layout, tabIdMap),
    tabs: snapshot.tabs.map((tab) => ({
      ...tab,
      tabId: tabIdMap.get(tab.tabId) ?? namespaceTabId(workspaceId, tab.tabId),
    })),
    activeTabId: tabIdMap.get(snapshot.activeTabId) ?? namespaceTabId(workspaceId, snapshot.activeTabId),
    nextTabNumber: snapshot.nextTabNumber,
  };
}

function rewriteLayoutLeafIds(node: LayoutNode, tabIdMap: Map<string, string>): LayoutNode {
  if (node.kind === "pane") {
    const paneId = tabIdMap.get(node.paneId) ?? node.paneId;
    return {
      ...node,
      id: `pane:${paneId}`,
      paneId,
    };
  }

  return {
    ...node,
    children: node.children.map((child) => rewriteLayoutLeafIds(child, tabIdMap)),
  };
}

function namespaceTabId(workspaceId: string, tabId: string): string {
  return tabId.startsWith(`${workspaceId}:`) ? tabId : `${workspaceId}:${tabId}`;
}

function inferNextWorkspaceNumber(nextWorkspaceNumber: unknown, workspaceIds: string[]): number {
  const inferred = workspaceIds.reduce((maxValue, workspaceId) => {
    const match = /^ws:(\d+)$/.exec(workspaceId);
    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]) + 1);
  }, 2);

  if (typeof nextWorkspaceNumber !== "number" || Number.isFinite(nextWorkspaceNumber) === false) {
    return inferred;
  }

  return Math.max(inferred, Math.max(2, Math.round(nextWorkspaceNumber)));
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
