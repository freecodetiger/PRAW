import { collectLeafPaneIds } from "../layout/tree";
import type { LayoutNode, SplitAxis } from "../layout/types";
import type { PaneSnapshot, WorkspaceSnapshot } from "./snapshot";

const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;

export function normalizeWorkspaceSnapshot(
  snapshot: WorkspaceSnapshot | null | undefined,
): WorkspaceSnapshot | null {
  if (!snapshot?.layout || !Array.isArray(snapshot.panes) || snapshot.panes.length === 0) {
    return null;
  }

  const layout = normalizeLayoutNode(snapshot.layout);
  if (!layout) {
    return null;
  }

  const leafPaneIds = collectLeafPaneIds(layout);
  if (leafPaneIds.length === 0 || new Set(leafPaneIds).size !== leafPaneIds.length) {
    return null;
  }

  const paneMap = new Map<string, PaneSnapshot>();
  for (const pane of snapshot.panes) {
    const normalizedPane = normalizePaneSnapshot(pane);
    if (!normalizedPane) {
      continue;
    }

    if (paneMap.has(normalizedPane.paneId)) {
      return null;
    }

    paneMap.set(normalizedPane.paneId, normalizedPane);
  }

  const panes = leafPaneIds
    .map((paneId) => paneMap.get(paneId))
    .filter((pane): pane is PaneSnapshot => pane !== undefined);

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

  if (node.kind === "leaf") {
    if (!isNonEmptyString(node.paneId)) {
      return null;
    }

    return {
      kind: "leaf",
      id: node.id,
      paneId: node.paneId,
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

function normalizeRatio(ratio: unknown): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) {
    return DEFAULT_SPLIT_RATIO;
  }

  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

function inferNextPaneNumber(nextPaneNumber: number, paneIds: string[]): number {
  const inferred = paneIds.reduce((maxValue, paneId) => {
    const match = /^pane:(\d+)$/.exec(paneId);
    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]) + 1);
  }, 2);

  if (typeof nextPaneNumber !== "number" || !Number.isFinite(nextPaneNumber)) {
    return inferred;
  }

  return Math.max(inferred, Math.max(2, Math.round(nextPaneNumber)));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
