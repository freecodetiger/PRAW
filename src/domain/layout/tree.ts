import type {
  FocusDirection,
  LayoutNode,
  LeafDragPreview,
  LeafDropEdge,
  LeafNode,
  LeafRect,
  SplitAxis,
  SplitNode,
} from "./types";

export type { FocusDirection } from "./types";

const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;

export function createLeafLayout(leafId: string): LeafNode {
  return {
    kind: "leaf",
    id: `layout:${leafId}`,
    leafId,
  };
}

export function collectLeafIds(node: LayoutNode): string[] {
  if (node.kind === "leaf") {
    return [getNodeLeafId(node)];
  }

  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

export function countLeaves(node: LayoutNode): number {
  return collectLeafIds(node).length;
}

export function getFirstLeafId(node: LayoutNode): string {
  if (node.kind === "leaf") {
    return getNodeLeafId(node);
  }

  return getFirstLeafId(node.first);
}

export function splitLeaf(
  node: LayoutNode,
  targetLeafId: string,
  newLeafId: string,
  axis: SplitAxis,
): LayoutNode {
  if (node.kind === "leaf") {
    if (getNodeLeafId(node) !== targetLeafId) {
      return node;
    }

    return createSplitNode(axis, node, createLeafLayout(newLeafId));
  }

  return {
    ...node,
    first: splitLeaf(node.first, targetLeafId, newLeafId, axis),
    second: splitLeaf(node.second, targetLeafId, newLeafId, axis),
  };
}

export function removeLeaf(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.kind === "leaf") {
    return getNodeLeafId(node) === leafId ? null : node;
  }

  const nextFirst = removeLeaf(node.first, leafId);
  const nextSecond = removeLeaf(node.second, leafId);

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

export function toLeafRects(node: LayoutNode): Record<string, LeafRect> {
  const rects: Record<string, LeafRect> = {};
  collectRects(node, { x: 0, y: 0, width: 1, height: 1 }, rects);
  return rects;
}

export function findAdjacentLeafId(
  node: LayoutNode,
  leafId: string,
  direction: FocusDirection,
): string | null {
  const rects = toLeafRects(node);
  const source = rects[leafId];
  if (!source) {
    return null;
  }

  let bestLeafId: string | null = null;
  let bestPrimaryDistance = Number.POSITIVE_INFINITY;
  let bestSecondaryDistance = Number.POSITIVE_INFINITY;

  for (const [candidateLeafId, candidate] of Object.entries(rects)) {
    if (candidateLeafId === leafId) {
      continue;
    }

    const metrics = getDirectionalMetrics(source, candidate, direction);
    if (!metrics) {
      continue;
    }

    if (metrics.primaryDistance < bestPrimaryDistance) {
      bestLeafId = candidateLeafId;
      bestPrimaryDistance = metrics.primaryDistance;
      bestSecondaryDistance = metrics.secondaryDistance;
      continue;
    }

    if (metrics.primaryDistance === bestPrimaryDistance && metrics.secondaryDistance < bestSecondaryDistance) {
      bestLeafId = candidateLeafId;
      bestSecondaryDistance = metrics.secondaryDistance;
    }
  }

  return bestLeafId;
}

export function createLeafDragPreview(
  node: LayoutNode,
  sourceLeafId: string,
  targetLeafId: string,
  edge: LeafDropEdge,
): LeafDragPreview | null {
  const leafIds = new Set(collectLeafIds(node));
  if (sourceLeafId === targetLeafId || !leafIds.has(sourceLeafId) || !leafIds.has(targetLeafId)) {
    return null;
  }

  return {
    sourceLeafId,
    targetLeafId,
    axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
    order: edge === "left" || edge === "top" ? "before" : "after",
  };
}

export function applyLeafDragPreview(node: LayoutNode, preview: LeafDragPreview): LayoutNode {
  if (preview.sourceLeafId === preview.targetLeafId) {
    return node;
  }

  const detached = detachLeaf(node, preview.sourceLeafId);
  if (!detached.remaining || !detached.removedLeaf) {
    return node;
  }

  const inserted = insertRelativeToTarget(
    detached.remaining,
    preview.targetLeafId,
    detached.removedLeaf,
    preview.axis,
    preview.order,
  );

  return inserted ?? node;
}

export const collectLeafPaneIds = collectLeafIds;
export const getFirstLeafPaneId = getFirstLeafId;
export const splitPane = splitLeaf;
export const removePane = removeLeaf;
export const toPaneRects = toLeafRects;
export const findAdjacentPaneId = findAdjacentLeafId;
export const createPaneDragPreview = createLeafDragPreview;
export const applyPaneDragPreview = applyLeafDragPreview;

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

function detachLeaf(
  node: LayoutNode,
  leafId: string,
): { remaining: LayoutNode | null; removedLeaf: LeafNode | null } {
  if (node.kind === "leaf") {
    if (getNodeLeafId(node) !== leafId) {
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

  const left = detachLeaf(node.first, leafId);
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

  const right = detachLeaf(node.second, leafId);
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
  targetLeafId: string,
  movedLeaf: LeafNode,
  axis: SplitAxis,
  order: "before" | "after",
): LayoutNode | null {
  if (node.kind === "leaf") {
    if (getNodeLeafId(node) !== targetLeafId) {
      return null;
    }

    return order === "before" ? createSplitNode(axis, movedLeaf, node) : createSplitNode(axis, node, movedLeaf);
  }

  const nextFirst = insertRelativeToTarget(node.first, targetLeafId, movedLeaf, axis, order);
  if (nextFirst) {
    return {
      ...node,
      first: nextFirst,
    };
  }

  const nextSecond = insertRelativeToTarget(node.second, targetLeafId, movedLeaf, axis, order);
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

function collectRects(node: LayoutNode, rect: LeafRect, rects: Record<string, LeafRect>): void {
  if (node.kind === "leaf") {
    rects[getNodeLeafId(node)] = rect;
    return;
  }

  if (node.axis === "horizontal") {
    collectRects(node.first, { ...rect, width: rect.width * node.ratio }, rects);
    collectRects(
      node.second,
      {
        x: rect.x + rect.width * node.ratio,
        y: rect.y,
        width: rect.width * (1 - node.ratio),
        height: rect.height,
      },
      rects,
    );
    return;
  }

  collectRects(node.first, { ...rect, height: rect.height * node.ratio }, rects);
  collectRects(
    node.second,
    {
      x: rect.x,
      y: rect.y + rect.height * node.ratio,
      width: rect.width,
      height: rect.height * (1 - node.ratio),
    },
    rects,
  );
}

function getDirectionalMetrics(
  source: LeafRect,
  candidate: LeafRect,
  direction: FocusDirection,
): { primaryDistance: number; secondaryDistance: number } | null {
  switch (direction) {
    case "left":
      if (candidate.x + candidate.width > source.x) {
        return null;
      }

      return {
        primaryDistance: source.x - (candidate.x + candidate.width),
        secondaryDistance: verticalDistanceBetween(source, candidate),
      };
    case "right":
      if (candidate.x < source.x + source.width) {
        return null;
      }

      return {
        primaryDistance: candidate.x - (source.x + source.width),
        secondaryDistance: verticalDistanceBetween(source, candidate),
      };
    case "up":
      if (candidate.y + candidate.height > source.y) {
        return null;
      }

      return {
        primaryDistance: source.y - (candidate.y + candidate.height),
        secondaryDistance: horizontalDistanceBetween(source, candidate),
      };
    case "down":
      if (candidate.y < source.y + source.height) {
        return null;
      }

      return {
        primaryDistance: candidate.y - (source.y + source.height),
        secondaryDistance: horizontalDistanceBetween(source, candidate),
      };
  }
}

function horizontalDistanceBetween(a: LeafRect, b: LeafRect): number {
  const aCenter = a.x + a.width / 2;
  const bCenter = b.x + b.width / 2;
  return Math.abs(aCenter - bCenter);
}

function verticalDistanceBetween(a: LeafRect, b: LeafRect): number {
  const aCenter = a.y + a.height / 2;
  const bCenter = b.y + b.height / 2;
  return Math.abs(aCenter - bCenter);
}

export function getNodeLeafId(node: LeafNode): string {
  return "leafId" in node ? node.leafId : node.paneId;
}
