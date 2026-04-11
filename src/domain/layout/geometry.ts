import type { ContainerNode, LayoutNode, LeafRect, SplitAxis } from "./types";

export const MIN_PANE_WIDTH_PX = 220;
export const MIN_INTERIOR_PANE_HEIGHT_PX = 72;
const MIN_PANE_HEADER_HEIGHT_PX = 36;
const MIN_PANE_COMPOSER_HEIGHT_PX = 56;
const MIN_PANE_CONTENT_HEIGHT_PX = 36;
export const MIN_BOUNDARY_PANE_HEIGHT_PX =
  MIN_PANE_HEADER_HEIGHT_PX + MIN_PANE_COMPOSER_HEIGHT_PX + MIN_PANE_CONTENT_HEIGHT_PX;
export const SPLIT_DIVIDER_SIZE_PX = 6;

export interface LayoutFrame {
  widthPx: number;
  heightPx: number;
}

export interface PanePlacement {
  touchesWindowTop: boolean;
  touchesWindowRight: boolean;
  touchesWindowBottom: boolean;
  touchesWindowLeft: boolean;
}

export interface PaneMinimums {
  minWidthPx: number;
  minHeightPx: number;
}

export interface SolvedContainerGeometry {
  id: string;
  axis: SplitAxis;
  rect: LeafRect;
  childSizesPx: number[];
  childPlacements: PanePlacement[];
  children: LayoutNode[];
}

export interface SolvedLayoutGeometry {
  paneRects: Record<string, LeafRect>;
  panePlacements: Record<string, PanePlacement>;
  containers: Record<string, SolvedContainerGeometry>;
}

export interface DividerResizeIntent {
  containerId: string;
  dividerIndex: number;
  deltaPx: number;
}

export type PaneMinimumResolver = (paneId: string, placement: PanePlacement) => PaneMinimums;

export function solveLayoutGeometry(
  node: LayoutNode,
  frame: LayoutFrame,
  resolveMinimums: PaneMinimumResolver,
): SolvedLayoutGeometry {
  const paneRects: Record<string, LeafRect> = {};
  const panePlacements: Record<string, PanePlacement> = {};
  const containers: Record<string, SolvedContainerGeometry> = {};

  walk(
    node,
    { x: 0, y: 0, width: frame.widthPx, height: frame.heightPx },
    {
      touchesWindowTop: true,
      touchesWindowRight: true,
      touchesWindowBottom: true,
      touchesWindowLeft: true,
    },
    paneRects,
    panePlacements,
    containers,
    resolveMinimums,
  );

  return {
    paneRects,
    panePlacements,
    containers,
  };
}

export function resizeContainerDivider(
  node: LayoutNode,
  frame: LayoutFrame,
  intent: DividerResizeIntent,
  resolveMinimums: PaneMinimumResolver,
): LayoutNode {
  const solved = solveLayoutGeometry(node, frame, resolveMinimums);
  const container = solved.containers[intent.containerId];
  if (!container) {
    return node;
  }

  const { dividerIndex } = intent;
  if (dividerIndex < 0 || dividerIndex >= container.children.length - 1) {
    return node;
  }

  const nextSizes = [...container.childSizesPx];
  const leftChild = container.children[dividerIndex];
  const rightChild = container.children[dividerIndex + 1];
  const leftPlacement = container.childPlacements[dividerIndex];
  const rightPlacement = container.childPlacements[dividerIndex + 1];
  const leftMinimum = getMinimumNodeSpanPx(leftChild, container.axis, leftPlacement, resolveMinimums);
  const rightMinimum = getMinimumNodeSpanPx(rightChild, container.axis, rightPlacement, resolveMinimums);
  const total = nextSizes[dividerIndex] + nextSizes[dividerIndex + 1];
  const requested = nextSizes[dividerIndex] + intent.deltaPx;
  const clamped = clamp(requested, leftMinimum, total - rightMinimum);

  nextSizes[dividerIndex] = clamped;
  nextSizes[dividerIndex + 1] = total - clamped;

  return updateContainerSizes(node, intent.containerId, nextSizes);
}

export function canSplitPane(
  node: LayoutNode,
  frame: LayoutFrame,
  paneId: string,
  axis: SplitAxis,
  resolveMinimums: PaneMinimumResolver,
): boolean {
  const solved = solveLayoutGeometry(node, frame, resolveMinimums);
  const rect = solved.paneRects[paneId];
  const placement = solved.panePlacements[paneId];
  if (!rect || !placement) {
    return false;
  }

  const currentMinimums = resolveMinimums(paneId, placement);
  if (axis === "horizontal") {
    return rect.width >= currentMinimums.minWidthPx * 2 + SPLIT_DIVIDER_SIZE_PX;
  }

  const topMinimum = resolveMinimums(paneId, {
    ...placement,
    touchesWindowBottom: false,
  }).minHeightPx;
  const bottomMinimum = resolveMinimums(paneId, placement).minHeightPx;
  return rect.height >= topMinimum + bottomMinimum + SPLIT_DIVIDER_SIZE_PX;
}

function walk(
  node: LayoutNode,
  rect: LeafRect,
  placement: PanePlacement,
  paneRects: Record<string, LeafRect>,
  panePlacements: Record<string, PanePlacement>,
  containers: Record<string, SolvedContainerGeometry>,
  resolveMinimums: PaneMinimumResolver,
): void {
  if (node.kind === "pane") {
    paneRects[node.paneId] = rect;
    panePlacements[node.paneId] = placement;
    return;
  }

  const childRects = getChildRects(node, rect);
  const childPlacements = node.children.map((_, index) => getChildPlacement(node.axis, placement, index, node.children.length));

  containers[node.id] = {
    id: node.id,
    axis: node.axis,
    rect,
    childSizesPx: childRects.map((childRect) => (node.axis === "horizontal" ? childRect.width : childRect.height)),
    childPlacements,
    children: node.children,
  };

  node.children.forEach((child, index) => {
    walk(child, childRects[index], childPlacements[index], paneRects, panePlacements, containers, resolveMinimums);
  });
}

function getChildRects(node: ContainerNode, rect: LeafRect): LeafRect[] {
  const dividerCount = Math.max(0, node.children.length - 1);
  const available = Math.max(0, (node.axis === "horizontal" ? rect.width : rect.height) - dividerCount * SPLIT_DIVIDER_SIZE_PX);
  const normalizedSizes = normalizeSizes(node.sizes, node.children.length);
  const total = normalizedSizes.reduce((sum, size) => sum + size, 0);
  const spans = normalizedSizes.map((size) => (total <= 0 ? available / node.children.length : (size / total) * available));
  const childRects: LeafRect[] = [];
  let cursor = node.axis === "horizontal" ? rect.x : rect.y;

  spans.forEach((span, index) => {
    if (node.axis === "horizontal") {
      childRects.push({
        x: cursor,
        y: rect.y,
        width: span,
        height: rect.height,
      });
      cursor += span;
    } else {
      childRects.push({
        x: rect.x,
        y: cursor,
        width: rect.width,
        height: span,
      });
      cursor += span;
    }

    if (index < spans.length - 1) {
      cursor += SPLIT_DIVIDER_SIZE_PX;
    }
  });

  return childRects;
}

function getChildPlacement(
  axis: SplitAxis,
  placement: PanePlacement,
  index: number,
  total: number,
): PanePlacement {
  if (axis === "horizontal") {
    return {
      ...placement,
      touchesWindowLeft: index === 0 ? placement.touchesWindowLeft : false,
      touchesWindowRight: index === total - 1 ? placement.touchesWindowRight : false,
    };
  }

  return {
    ...placement,
    touchesWindowTop: index === 0 ? placement.touchesWindowTop : false,
    touchesWindowBottom: index === total - 1 ? placement.touchesWindowBottom : false,
  };
}

function getMinimumNodeSpanPx(
  node: LayoutNode,
  axis: SplitAxis,
  placement: PanePlacement,
  resolveMinimums: PaneMinimumResolver,
): number {
  if (node.kind === "pane") {
    const minimums = resolveMinimums(node.paneId, placement);
    return axis === "horizontal" ? minimums.minWidthPx : minimums.minHeightPx;
  }

  const childPlacements = node.children.map((_, index) => getChildPlacement(node.axis, placement, index, node.children.length));
  if (node.axis === axis) {
    return (
      node.children.reduce(
        (sum, child, index) => sum + getMinimumNodeSpanPx(child, axis, childPlacements[index], resolveMinimums),
        0,
      ) +
      Math.max(0, node.children.length - 1) * SPLIT_DIVIDER_SIZE_PX
    );
  }

  return node.children.reduce((maxValue, child, index) => {
    return Math.max(maxValue, getMinimumNodeSpanPx(child, axis, childPlacements[index], resolveMinimums));
  }, 0);
}

function updateContainerSizes(node: LayoutNode, containerId: string, sizes: number[]): LayoutNode {
  if (node.kind === "pane") {
    return node;
  }

  if (node.id === containerId) {
    return {
      ...node,
      sizes,
    };
  }

  return {
    ...node,
    children: node.children.map((child) => updateContainerSizes(child, containerId, sizes)),
  };
}

function normalizeSizes(sizes: number[], count: number): number[] {
  const safeSizes = sizes.slice(0, count).map((size) => (Number.isFinite(size) && size > 0 ? size : 1));
  while (safeSizes.length < count) {
    safeSizes.push(1);
  }

  return safeSizes;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}
