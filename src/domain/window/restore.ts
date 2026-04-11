import { collectLeafIds } from "../layout/tree";
import type { LayoutNode, SplitAxis } from "../layout/types";
import { normalizeWorkspaceSnapshot } from "../workspace/restore";
import type { WorkspaceSnapshot } from "../workspace/snapshot";
import type { WindowSnapshot } from "./snapshot";

export function normalizeWindowSnapshot(snapshot: unknown): WindowSnapshot | null {
  return normalizeModernWindowSnapshot(snapshot) ?? normalizeLegacyWindowSnapshot(snapshot);
}

function normalizeModernWindowSnapshot(snapshot: unknown): WindowSnapshot | null {
  if (!isRecord(snapshot) || !("layout" in snapshot) || !Array.isArray(snapshot.tabs)) {
    return null;
  }

  const layout = normalizeLayoutNode(snapshot.layout);
  if (!layout) {
    return null;
  }

  const leafIds = collectLeafIds(layout);
  if (leafIds.length === 0 || new Set(leafIds).size !== leafIds.length) {
    return null;
  }

  const tabMap = new Map<string, WindowSnapshot["tabs"][number]>();
  for (const rawTab of snapshot.tabs) {
    const tab = normalizeTabSnapshot(rawTab);
    if (!tab) {
      continue;
    }

    if (tabMap.has(tab.tabId)) {
      return null;
    }

    tabMap.set(tab.tabId, tab);
  }

  const tabs = leafIds.map((leafId) => tabMap.get(leafId)).filter((tab): tab is NonNullable<typeof tab> => tab !== undefined);
  if (tabs.length !== leafIds.length) {
    return null;
  }

  const activeTabId =
    typeof snapshot.activeTabId === "string" && leafIds.includes(snapshot.activeTabId) ? snapshot.activeTabId : leafIds[0];

  return {
    layout,
    tabs,
    activeTabId,
    nextTabNumber: inferNextTabNumber(snapshot.nextTabNumber, leafIds),
  };
}

function normalizeLegacyWindowSnapshot(snapshot: unknown): WindowSnapshot | null {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.tabs) || snapshot.tabs.length === 0) {
    return null;
  }

  const tabOrder = Array.isArray(snapshot.tabOrder)
    ? snapshot.tabOrder.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (tabOrder.length === 0) {
    return null;
  }

  const workspaceMap = new Map<string, WorkspaceSnapshot>();
  for (const rawTab of snapshot.tabs) {
    if (!isRecord(rawTab) || !isNonEmptyString(rawTab.tabId)) {
      continue;
    }

    const workspace = normalizeWorkspaceSnapshot(rawTab.workspace as WorkspaceSnapshot | null | undefined);
    if (!workspace) {
      continue;
    }

    workspaceMap.set(rawTab.tabId, workspace);
  }

  const activeLegacyTabId =
    isNonEmptyString(snapshot.activeTabId) && workspaceMap.has(snapshot.activeTabId)
      ? snapshot.activeTabId
      : tabOrder.find((tabId) => workspaceMap.has(tabId));
  if (!activeLegacyTabId) {
    return null;
  }

  const workspace = workspaceMap.get(activeLegacyTabId);
  if (!workspace) {
    return null;
  }

  const paneIds = collectLeafIds(workspace.layout);
  const paneMap = new Map(workspace.panes.map((pane) => [pane.paneId, pane]));
  const tabs = paneIds.map((paneId, index) => {
    const pane = paneMap.get(paneId);
    if (!pane) {
      return null;
    }

    return {
      tabId: `tab:${index + 1}`,
      title: pane.title,
      shell: pane.shell,
      cwd: pane.cwd,
    };
  });

  if (tabs.some((tab) => tab === null)) {
    return null;
  }

  const tabIdByPaneId = new Map<string, string>();
  for (const [index, paneId] of paneIds.entries()) {
    tabIdByPaneId.set(paneId, `tab:${index + 1}`);
  }

  const layout = remapLegacyLayout(workspace.layout, tabIdByPaneId);
  const activeTabId = tabIdByPaneId.get(workspace.activePaneId) ?? "tab:1";
  const nextTabNumber = inferNextTabNumber(snapshot.nextTabNumber, Array.from(tabIdByPaneId.values()));

  return {
    layout,
    tabs: tabs.filter((tab): tab is NonNullable<typeof tab> => tab !== null),
    activeTabId,
    nextTabNumber,
  };
}

function normalizeTabSnapshot(tab: unknown): WindowSnapshot["tabs"][number] | null {
  if (!isRecord(tab) || !isNonEmptyString(tab.tabId)) {
    return null;
  }

  return {
    tabId: tab.tabId,
    title: isNonEmptyString(tab.title) ? tab.title : tab.tabId,
    note: isNonEmptyString(tab.note) ? tab.note.trim() : undefined,
    shell: isNonEmptyString(tab.shell) ? tab.shell : "/bin/bash",
    cwd: isNonEmptyString(tab.cwd) ? tab.cwd : "~",
  };
}

function normalizeLayoutNode(node: unknown): LayoutNode | null {
  if (!isRecord(node) || !isNonEmptyString(node.kind) || !isNonEmptyString(node.id)) {
    return null;
  }

  if (node.kind === "leaf") {
    const leafId = isNonEmptyString(node.leafId) ? node.leafId : isNonEmptyString(node.paneId) ? node.paneId : null;
    if (!leafId) {
      return null;
    }

    return {
      kind: "leaf",
      id: node.id,
      leafId,
    };
  }

  const axis = normalizeAxis(node.axis);
  if (!axis) {
    return null;
  }

  const first = normalizeLayoutNode(node.first);
  const second = normalizeLayoutNode(node.second);
  if (!first || !second) {
    return null;
  }

  return {
    kind: "split",
    id: node.id,
    axis,
    ratio: normalizeRatio(node.ratio),
    first,
    second,
  };
}

function remapLegacyLayout(node: LayoutNode, tabIdByPaneId: Map<string, string>): LayoutNode {
  if (node.kind === "leaf") {
    const paneId = "leafId" in node ? node.leafId : node.paneId;
    return {
      kind: "leaf",
      id: node.id,
      leafId: tabIdByPaneId.get(paneId) ?? paneId,
    };
  }

  return {
    ...node,
    first: remapLegacyLayout(node.first, tabIdByPaneId),
    second: remapLegacyLayout(node.second, tabIdByPaneId),
  };
}

function inferNextTabNumber(nextTabNumber: unknown, tabIds: string[]): number {
  const inferred = tabIds.reduce((maxValue, tabId) => {
    const match = /^tab:(\d+)$/.exec(tabId);
    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]) + 1);
  }, 2);

  if (typeof nextTabNumber !== "number" || !Number.isFinite(nextTabNumber)) {
    return inferred;
  }

  return Math.max(inferred, Math.max(2, Math.round(nextTabNumber)));
}

function normalizeAxis(axis: unknown): SplitAxis | null {
  return axis === "horizontal" || axis === "vertical" ? axis : null;
}

function normalizeRatio(ratio: unknown): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) {
    return 0.5;
  }

  return Math.min(0.85, Math.max(0.15, ratio));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
