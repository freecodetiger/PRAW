import { collectLeafPaneIds } from "../layout/tree";
import type { LayoutNode, SplitAxis } from "../layout/types";
import type { PaneSnapshot, WorkspaceSnapshot } from "./snapshot";

export function normalizeWorkspaceSnapshot(
  snapshot: WorkspaceSnapshot | null | undefined,
): WorkspaceSnapshot | null {
  if (snapshot === null || snapshot === undefined || snapshot.layout === undefined || snapshot.layout === null) {
    return null;
  }

  if (Array.isArray(snapshot.panes) === false || snapshot.panes.length === 0) {
    return null;
  }

  const layout = normalizeLayoutNode(snapshot.layout);
  if (layout === null) {
    return null;
  }

  const leafPaneIds = collectLeafPaneIds(layout);
  if (leafPaneIds.length === 0 || new Set(leafPaneIds).size !== leafPaneIds.length) {
    return null;
  }

  const paneMap = new Map<string, PaneSnapshot>();
  for (const pane of snapshot.panes) {
    const normalizedPane = normalizePaneSnapshot(pane);
    if (normalizedPane === null) {
      continue;
    }

    if (paneMap.has(normalizedPane.paneId)) {
      return null;
    }

    paneMap.set(normalizedPane.paneId, normalizedPane);
  }

  const panes = leafPaneIds
    .map((paneId) => paneMap.get(paneId))
    .filter((pane): pane is PaneSnapshot => pane !== null && typeof pane === "object");

  if (panes.length !== leafPaneIds.length) {
    return null;
  }

  return {
    layout,
    activePaneId: leafPaneIds.includes(snapshot.activePaneId) ? snapshot.activePaneId : leafPaneIds[0],
    nextPaneNumber: inferNextPaneNumber(snapshot.nextPaneNumber, leafPaneIds),
    panes,
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

function normalizePaneSnapshot(pane: unknown): PaneSnapshot | null {
  if (!isRecord(pane) || !isNonEmptyString(pane.paneId) || !isNonEmptyString(pane.title)) {
    return null;
  }

  return {
    paneId: pane.paneId,
    title: pane.title,
    shell: isNonEmptyString(pane.shell) ? pane.shell : "/bin/bash",
    cwd: isNonEmptyString(pane.cwd) ? pane.cwd : "~",
  };
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

function inferNextPaneNumber(nextPaneNumber: number, paneIds: string[]): number {
  const inferred = paneIds.reduce((maxValue, paneId) => {
    const parts = paneId.split(":");
    if (parts.length !== 2 || parts[0] !== "pane") {
      return maxValue;
    }

    const numericPart = Number(parts[1]);
    return Number.isFinite(numericPart) ? Math.max(maxValue, numericPart + 1) : maxValue;
  }, 2);

  if (typeof nextPaneNumber !== "number" || Number.isFinite(nextPaneNumber) === false) {
    return inferred;
  }

  return Math.max(inferred, Math.max(2, Math.round(nextPaneNumber)));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
