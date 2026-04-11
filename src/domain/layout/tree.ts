import type {
  FocusDirection,
  LayoutNode,
  LeafNode,
  PaneDragPreview,
  PaneDropEdge,
  PaneRect,
  SplitAxis,
  SplitNode,
} from "./types";

export type { FocusDirection } from "./types";

const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;

export function createLeafLayout(paneId: string): LeafNode {
  return {
    kind: "leaf",
    id: `layout:${paneId}`,
    paneId,
  };
}

export function collectLeafPaneIds(node: LayoutNode): string[] {
  if (node.kind === "leaf") {
    return [node.paneId];
  }

  return [...collectLeafPaneIds(node.first), ...collectLeafPaneIds(node.second)];
}

export function countLeaves(node: LayoutNode): number {
  return collectLeafPaneIds(node).length;
}

export function getFirstLeafPaneId(node: LayoutNode): string {
  if (node.kind === "leaf") {
    return node.paneId;
  }

  return getFirstLeafPaneId(node.first);
}

export function splitPane(
  node: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  axis: SplitAxis,
): LayoutNode {
  if (node.kind === "leaf") {
    if (node.paneId !== targetPaneId) {
      return node;
    }

    return createSplitNode(axis, node, createLeafLayout(newPaneId));
  }

  return {
    ...node,
    first: splitPane(node.first, targetPaneId, newPaneId, axis),
    second: splitPane(node.second, targetPaneId, newPaneId, axis),
  };
}

export function removePane(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.kind === "leaf") {
    return node.paneId === paneId ? null : node;
  }

  const nextFirst = removePane(node.first, paneId);
  const nextSecond = removePane(node.second, paneId);

  if (!nextFirst && !nextSecond) {
    return null;
  }

  if (!nextFirst) {
    return nextSecond;
  }

  if (!nextSecond) {
    return nextFirst;
  }

  return {
    ...node,
    first: nextFirst,
    second: nextSecond,
  };
}

export function setSplitRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.kind === "leaf") {
    return node;
  }

  if (node.id === splitId) {
    return {
      ...node,
      ratio: clampRatio(ratio),
    };
  }

  return {
    ...node,
    first: setSplitRatio(node.first, splitId, ratio),
    second: setSplitRatio(node.second, splitId, ratio),
  };
}

export function toPaneRects(node: LayoutNode): Record<string, PaneRect> {
  const rects: Record<string, PaneRect> = {};
  collectPaneRects(node, { x: 0, y: 0, width: 1, height: 1 }, rects);
  return rects;
}

export function findAdjacentPaneId(
  node: LayoutNode,
  paneId: string,
  direction: FocusDirection,
): string | null {
  const rects = toPaneRects(node);
  const source = rects[paneId];
  if (!source) {
    return null;
  }

  let bestPaneId: string | null = null;
  let bestPrimaryDistance = Number.POSITIVE_INFINITY;
  let bestSecondaryDistance = Number.POSITIVE_INFINITY;

  for (const [candidatePaneId, candidate] of Object.entries(rects)) {
    if (candidatePaneId === paneId) {
      continue;
    }

    const metrics = getDirectionalMetrics(source, candidate, direction);
    if (!metrics) {
      continue;
    }

    if (metrics.primaryDistance < bestPrimaryDistance) {
      bestPaneId = candidatePaneId;
      bestPrimaryDistance = metrics.primaryDistance;
      bestSecondaryDistance = metrics.secondaryDistance;
      continue;
    }

    if (
      metrics.primaryDistance === bestPrimaryDistance &&
      metrics.secondaryDistance < bestSecondaryDistance
    ) {
      bestPaneId = candidatePaneId;
      bestSecondaryDistance = metrics.secondaryDistance;
    }
  }

  return bestPaneId;
}

export function createPaneDragPreview(
  node: LayoutNode,
  sourcePaneId: string,
  targetPaneId: string,
  edge: PaneDropEdge,
): PaneDragPreview | null {
  const paneIds = new Set(collectLeafPaneIds(node));
  if (
    sourcePaneId === targetPaneId ||
    !paneIds.has(sourcePaneId) ||
    !paneIds.has(targetPaneId)
  ) {
    return null;
  }

  return {
    sourcePaneId,
    targetPaneId,
    axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
    order: edge === "left" || edge === "top" ? "before" : "after",
  };
}

export function applyPaneDragPreview(
  node: LayoutNode,
  preview: PaneDragPreview,
): LayoutNode {
  if (preview.sourcePaneId === preview.targetPaneId) {
    return node;
  }

  const detached = detachPane(node, preview.sourcePaneId);
  if (!detached.remaining || !detached.removedLeaf) {
    return node;
  }

  const inserted = insertRelativeToTarget(
    detached.remaining,
    preview.targetPaneId,
    detached.removedLeaf,
    preview.axis,
    preview.order,
  );

  return inserted ?? node;
}

function createSplitNode(axis: SplitAxis, first: LayoutNode, second: LayoutNode): SplitNode {
  return {
    kind: "split",
    id: `split:${first.id}:${second.id}`,
    axis,
    ratio: 0.5,
    first,
    second,
  };
}

function detachPane(
  node: LayoutNode,
  paneId: string,
): { remaining: LayoutNode | null; removedLeaf: LeafNode | null } {
  if (node.kind === "leaf") {
    if (node.paneId !== paneId) {
      return {
        remaining: node,
        removedLeaf: null,
      };
    }

    return {
      remaining: null,
      removedLeaf: node,
    };
  }

  const left = detachPane(node.first, paneId);
  if (left.removedLeaf) {
    return {
      remaining: left.remaining
        ? {
            ...node,
            first: left.remaining,
          }
        : node.second,
      removedLeaf: left.removedLeaf,
    };
  }

  const right = detachPane(node.second, paneId);
  if (right.removedLeaf) {
    return {
      remaining: right.remaining
        ? {
            ...node,
            second: right.remaining,
          }
        : node.first,
      removedLeaf: right.removedLeaf,
    };
  }

  return {
    remaining: node,
    removedLeaf: null,
  };
}

function insertRelativeToTarget(
  node: LayoutNode,
  targetPaneId: string,
  movedLeaf: LeafNode,
  axis: SplitAxis,
  order: "before" | "after",
): LayoutNode | null {
  if (node.kind === "leaf") {
    if (node.paneId !== targetPaneId) {
      return null;
    }

    return order === "before"
      ? createSplitNode(axis, movedLeaf, node)
      : createSplitNode(axis, node, movedLeaf);
  }

  const nextFirst = insertRelativeToTarget(node.first, targetPaneId, movedLeaf, axis, order);
  if (nextFirst) {
    return {
      ...node,
      first: nextFirst,
    };
  }

  const nextSecond = insertRelativeToTarget(node.second, targetPaneId, movedLeaf, axis, order);
  if (nextSecond) {
    return {
      ...node,
      second: nextSecond,
    };
  }

  return null;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0.5;
  }

  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

function collectPaneRects(
  node: LayoutNode,
  rect: PaneRect,
  rects: Record<string, PaneRect>,
): void {
  if (node.kind === "leaf") {
    rects[node.paneId] = rect;
    return;
  }

  if (node.axis === "horizontal") {
    const firstWidth = rect.width * node.ratio;
    collectPaneRects(node.first, { ...rect, width: firstWidth }, rects);
    collectPaneRects(
      node.second,
      {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      },
      rects,
    );
    return;
  }

  const firstHeight = rect.height * node.ratio;
  collectPaneRects(node.first, { ...rect, height: firstHeight }, rects);
  collectPaneRects(
    node.second,
    {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    },
    rects,
  );
}

function getDirectionalMetrics(
  source: PaneRect,
  candidate: PaneRect,
  direction: FocusDirection,
): { primaryDistance: number; secondaryDistance: number } | null {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const candidateCenterX = candidate.x + candidate.width / 2;
  const candidateCenterY = candidate.y + candidate.height / 2;

  switch (direction) {
    case "left":
      if (candidateCenterX >= sourceCenterX || !rangesOverlap(source.y, source.y + source.height, candidate.y, candidate.y + candidate.height)) {
        return null;
      }
      return {
        primaryDistance: sourceCenterX - candidateCenterX,
        secondaryDistance: Math.abs(sourceCenterY - candidateCenterY),
      };
    case "right":
      if (candidateCenterX <= sourceCenterX || !rangesOverlap(source.y, source.y + source.height, candidate.y, candidate.y + candidate.height)) {
        return null;
      }
      return {
        primaryDistance: candidateCenterX - sourceCenterX,
        secondaryDistance: Math.abs(sourceCenterY - candidateCenterY),
      };
    case "up":
      if (candidateCenterY >= sourceCenterY || !rangesOverlap(source.x, source.x + source.width, candidate.x, candidate.x + candidate.width)) {
        return null;
      }
      return {
        primaryDistance: sourceCenterY - candidateCenterY,
        secondaryDistance: Math.abs(sourceCenterX - candidateCenterX),
      };
    case "down":
      if (candidateCenterY <= sourceCenterY || !rangesOverlap(source.x, source.x + source.width, candidate.x, candidate.x + candidate.width)) {
        return null;
      }
      return {
        primaryDistance: candidateCenterY - sourceCenterY,
        secondaryDistance: Math.abs(sourceCenterX - candidateCenterX),
      };
  }
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) > Math.max(startA, startB);
}
