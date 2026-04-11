import { solveLayoutGeometry } from "./geometry";
import type {
  ContainerNode,
  FocusDirection,
  LayoutNode,
  LeafDragPreview,
  LeafDropEdge,
  LeafNode,
  LeafRect,
  SplitAxis,
} from "./types";

export type { FocusDirection } from "./types";

export function createLeafLayout(leafId: string): LeafNode {
  return {
    kind: "pane",
    id: `pane:${leafId}`,
    paneId: leafId,
  };
}

export function collectLeafIds(node: LayoutNode): string[] {
  if (node.kind === "pane") {
    return [node.paneId];
  }

  return node.children.flatMap(collectLeafIds);
}

export function countLeaves(node: LayoutNode): number {
  return collectLeafIds(node).length;
}

export function getFirstLeafId(node: LayoutNode): string {
  if (node.kind === "pane") {
    return node.paneId;
  }

  return getFirstLeafId(node.children[0]);
}

export function splitLeaf(node: LayoutNode, targetLeafId: string, newLeafId: string, axis: SplitAxis): LayoutNode {
  const next = splitLeafInternal(node, targetLeafId, newLeafId, axis);
  return normalizeNode(next) ?? node;
}

export function removeLeaf(node: LayoutNode, leafId: string): LayoutNode | null {
  const next = removeLeafInternal(node, leafId);
  return normalizeNode(next);
}

export function toLeafRects(node: LayoutNode): Record<string, LeafRect> {
  return solveLayoutGeometry(
    node,
    { widthPx: 1000, heightPx: 1000 },
    () => ({
      minWidthPx: 0,
      minHeightPx: 0,
    }),
  ).paneRects;
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

  const inserted = insertRelativeToTarget(detached.remaining, preview.targetLeafId, detached.removedLeaf, preview.axis, preview.order);
  return normalizeNode(inserted) ?? node;
}

export const collectLeafPaneIds = collectLeafIds;
export const getFirstLeafPaneId = getFirstLeafId;
export const splitPane = splitLeaf;
export const removePane = removeLeaf;
export const toPaneRects = toLeafRects;
export const findAdjacentPaneId = findAdjacentLeafId;
export const createPaneDragPreview = createLeafDragPreview;
export const applyPaneDragPreview = applyLeafDragPreview;

function splitLeafInternal(node: LayoutNode, targetLeafId: string, newLeafId: string, axis: SplitAxis): LayoutNode {
  if (node.kind === "pane") {
    if (node.paneId !== targetLeafId) {
      return node;
    }

    return createContainer(axis, [node, createLeafLayout(newLeafId)], [1, 1]);
  }

  const nextChildren = node.children.map((child) => splitLeafInternal(child, targetLeafId, newLeafId, axis));
  return {
    ...node,
    children: nextChildren,
  };
}

function removeLeafInternal(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.kind === "pane") {
    return node.paneId === leafId ? null : node;
  }

  const nextChildren: LayoutNode[] = [];
  const nextSizes: number[] = [];

  node.children.forEach((child, index) => {
    const nextChild = removeLeafInternal(child, leafId);
    if (!nextChild) {
      return;
    }

    nextChildren.push(nextChild);
    nextSizes.push(node.sizes[index] ?? 1);
  });

  if (nextChildren.length === 0) {
    return null;
  }

  return {
    ...node,
    children: nextChildren,
    sizes: nextSizes,
  };
}

function detachLeaf(
  node: LayoutNode,
  leafId: string,
): { remaining: LayoutNode | null; removedLeaf: LeafNode | null } {
  if (node.kind === "pane") {
    if (node.paneId !== leafId) {
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

  for (let index = 0; index < node.children.length; index += 1) {
    const result = detachLeaf(node.children[index], leafId);
    if (!result.removedLeaf) {
      continue;
    }

    const nextChildren = [...node.children];
    const nextSizes = [...node.sizes];
    if (result.remaining) {
      nextChildren[index] = result.remaining;
    } else {
      nextChildren.splice(index, 1);
      nextSizes.splice(index, 1);
    }

    return {
      remaining: normalizeNode({
        ...node,
        children: nextChildren,
        sizes: nextSizes,
      }),
      removedLeaf: result.removedLeaf,
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
): LayoutNode {
  if (node.kind === "pane") {
    if (node.paneId !== targetLeafId) {
      return node;
    }

    return order === "before"
      ? createContainer(axis, [movedLeaf, node], [1, 1])
      : createContainer(axis, [node, movedLeaf], [1, 1]);
  }

  const directTargetIndex = node.children.findIndex((child) => child.kind === "pane" && child.paneId === targetLeafId);
  if (directTargetIndex >= 0 && node.axis === axis) {
    const insertIndex = order === "before" ? directTargetIndex : directTargetIndex + 1;
    const referenceSize = node.sizes[directTargetIndex] ?? 1;
    const nextChildren = [...node.children];
    const nextSizes = [...node.sizes];
    nextChildren.splice(insertIndex, 0, movedLeaf);
    nextSizes.splice(insertIndex, 0, referenceSize);
    return {
      ...node,
      children: nextChildren,
      sizes: nextSizes,
    };
  }

  return {
    ...node,
    children: node.children.map((child) => insertRelativeToTarget(child, targetLeafId, movedLeaf, axis, order)),
  };
}

function normalizeNode(node: LayoutNode | null): LayoutNode | null {
  if (!node) {
    return null;
  }

  if (node.kind === "pane") {
    return node;
  }

  const collectedChildren: LayoutNode[] = [];
  const collectedSizes: number[] = [];

  node.children.forEach((child, index) => {
    const normalizedChild = normalizeNode(child);
    if (!normalizedChild) {
      return;
    }

    const slotSize = sanitizeSize(node.sizes[index]);
    if (normalizedChild.kind === "container" && normalizedChild.axis === node.axis) {
      const childTotal = normalizedChild.sizes.reduce((sum, size) => sum + sanitizeSize(size), 0) || normalizedChild.children.length;
      normalizedChild.children.forEach((grandchild, grandchildIndex) => {
        collectedChildren.push(grandchild);
        collectedSizes.push((slotSize * sanitizeSize(normalizedChild.sizes[grandchildIndex])) / childTotal);
      });
      return;
    }

    collectedChildren.push(normalizedChild);
    collectedSizes.push(slotSize);
  });

  if (collectedChildren.length === 0) {
    return null;
  }

  if (collectedChildren.length === 1) {
    return collectedChildren[0];
  }

  return {
    kind: "container",
    id: node.id,
    axis: node.axis,
    children: collectedChildren,
    sizes: collectedSizes,
  };
}

function createContainer(axis: SplitAxis, children: LayoutNode[], sizes: number[]): ContainerNode {
  return {
    kind: "container",
    id: `container:${axis}:${children.map((child) => child.id).join(":")}`,
    axis,
    children,
    sizes,
  };
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

function sanitizeSize(size: number | undefined): number {
  return Number.isFinite(size) && (size ?? 0) > 0 ? (size as number) : 1;
}

export function getNodeLeafId(node: LeafNode): string {
  return node.paneId;
}
