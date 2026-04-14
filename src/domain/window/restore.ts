import { collectLeafIds } from "../layout/tree";
import type { LayoutNode, SplitAxis } from "../layout/types";
import { DEFAULT_TERMINAL_SHELL } from "../config/default-shell";
import { WINDOW_SNAPSHOT_VERSION, type WindowSnapshot } from "./snapshot";

export function normalizeWindowSnapshot(snapshot: unknown): WindowSnapshot | null {
  if (!isRecord(snapshot) || snapshot.version !== WINDOW_SNAPSHOT_VERSION || Array.isArray(snapshot.tabs) === false) {
    return null;
  }

  const layout = normalizeLayoutNode(snapshot.layout);
  if (layout === null) {
    return null;
  }

  const leafIds = collectLeafIds(layout);
  if (leafIds.length === 0 || new Set(leafIds).size !== leafIds.length) {
    return null;
  }

  const tabMap = new Map<string, WindowSnapshot["tabs"][number]>();
  for (const rawTab of snapshot.tabs) {
    const tab = normalizeTabSnapshot(rawTab);
    if (tab === null) {
      continue;
    }

    if (tabMap.has(tab.tabId)) {
      return null;
    }

    tabMap.set(tab.tabId, tab);
  }

  const tabs = leafIds.map((leafId) => tabMap.get(leafId)).filter((tab): tab is NonNullable<typeof tab> => tab !== null && typeof tab === "object");
  if (tabs.length !== leafIds.length) {
    return null;
  }

  const activeTabId = typeof snapshot.activeTabId === "string" && leafIds.includes(snapshot.activeTabId)
    ? snapshot.activeTabId
    : leafIds[0];

  return {
    version: WINDOW_SNAPSHOT_VERSION,
    layout,
    tabs,
    activeTabId,
    nextTabNumber: inferNextTabNumber(snapshot.nextTabNumber, leafIds),
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
    shell: isNonEmptyString(tab.shell) ? tab.shell : DEFAULT_TERMINAL_SHELL,
    cwd: isNonEmptyString(tab.cwd) ? tab.cwd : "~",
  };
}

function normalizeLayoutNode(node: unknown): LayoutNode | null {
  if (!isRecord(node) || !isNonEmptyString(node.kind) || !isNonEmptyString(node.id)) {
    return null;
  }

  if (node.kind === "pane") {
    if (!isNonEmptyString(node.paneId)) {
      return null;
    }

    return {
      kind: "pane",
      id: node.id,
      paneId: node.paneId,
    };
  }

  if (node.kind !== "container") {
    return null;
  }

  const axis = normalizeAxis(node.axis);
  if (axis === null || Array.isArray(node.children) === false || node.children.length < 1) {
    return null;
  }

  const children = node.children
    .map(normalizeLayoutNode)
    .filter((child): child is LayoutNode => child !== null && typeof child === "object");
  if (children.length !== node.children.length) {
    return null;
  }

  const sizes = normalizeSizes(node.sizes, children.length);
  return {
    kind: "container",
    id: node.id,
    axis,
    children,
    sizes,
  };
}

function inferNextTabNumber(nextTabNumber: unknown, tabIds: string[]): number {
  const inferred = tabIds.reduce((maxValue, tabId) => {
    const parts = tabId.split(":");
    if (parts.length !== 2 || parts[0] !== "tab") {
      return maxValue;
    }

    const numericPart = Number(parts[1]);
    return Number.isFinite(numericPart) ? Math.max(maxValue, numericPart + 1) : maxValue;
  }, 2);

  if (typeof nextTabNumber !== "number" || Number.isFinite(nextTabNumber) === false) {
    return inferred;
  }

  return Math.max(inferred, Math.max(2, Math.round(nextTabNumber)));
}

function normalizeAxis(axis: unknown): SplitAxis | null {
  return axis === "horizontal" || axis === "vertical" ? axis : null;
}

function normalizeSizes(value: unknown, count: number): number[] {
  const raw = Array.isArray(value) ? value : [];
  const sizes = raw
    .slice(0, count)
    .map((item) => (typeof item === "number" && Number.isFinite(item) && item > 0 ? item : 1));
  while (sizes.length < count) {
    sizes.push(1);
  }
  return sizes;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
