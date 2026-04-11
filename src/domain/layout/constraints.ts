import type { LayoutNode, SplitAxis, SplitNode } from "./types";

export const MIN_PANE_WIDTH_PX = 220;
export const MIN_INTERIOR_PANE_HEIGHT_PX = 72;
const MIN_PANE_HEADER_HEIGHT_PX = 36;
const MIN_PANE_COMPOSER_HEIGHT_PX = 56;
const MIN_PANE_CONTENT_HEIGHT_PX = 36;

export const MIN_BOUNDARY_PANE_HEIGHT_PX =
  MIN_PANE_HEADER_HEIGHT_PX + MIN_PANE_COMPOSER_HEIGHT_PX + MIN_PANE_CONTENT_HEIGHT_PX;
export const SPLIT_DIVIDER_SIZE_PX = 6;

interface AxisConstraintOptions {
  preserveTrailingBoundary?: boolean;
}

export function canSplitPaneAtSize(
  axis: SplitAxis,
  sizePx: number,
  options: AxisConstraintOptions = {},
): boolean {
  if (axis === "horizontal") {
    return sizePx >= MIN_PANE_WIDTH_PX * 2 + SPLIT_DIVIDER_SIZE_PX;
  }

  const topMinimum = MIN_INTERIOR_PANE_HEIGHT_PX;
  const bottomMinimum = getVerticalLeafMinimum(options.preserveTrailingBoundary ?? false);
  return sizePx >= topMinimum + bottomMinimum + SPLIT_DIVIDER_SIZE_PX;
}

export function constrainSplitRatio(
  node: SplitNode,
  containerSizePx: number,
  requestedRatio: number,
  options: AxisConstraintOptions = {},
): number {
  if (!Number.isFinite(requestedRatio)) {
    return node.ratio;
  }

  const availableSizePx = containerSizePx - SPLIT_DIVIDER_SIZE_PX;
  if (availableSizePx <= 0) {
    return node.ratio;
  }

  const preserveTrailingBoundary = options.preserveTrailingBoundary ?? false;
  const firstMinimum = getMinimumSubtreeSpanPx(node.first, node.axis, { preserveTrailingBoundary: false });
  const secondMinimum = getMinimumSubtreeSpanPx(node.second, node.axis, {
    preserveTrailingBoundary,
  });
  const minRatio = firstMinimum / availableSizePx;
  const maxRatio = 1 - secondMinimum / availableSizePx;

  if (minRatio > maxRatio) {
    return node.ratio;
  }

  return Math.min(maxRatio, Math.max(minRatio, requestedRatio));
}

export function getMinimumSubtreeSpanPx(
  node: LayoutNode,
  axis: SplitAxis,
  options: AxisConstraintOptions = {},
): number {
  const preserveTrailingBoundary = options.preserveTrailingBoundary ?? false;

  if (node.kind === "leaf") {
    return getLeafMinimumSpanPx(axis, preserveTrailingBoundary);
  }

  if (node.axis === axis) {
    return (
      getMinimumSubtreeSpanPx(node.first, axis, { preserveTrailingBoundary: false }) +
      SPLIT_DIVIDER_SIZE_PX +
      getMinimumSubtreeSpanPx(node.second, axis, { preserveTrailingBoundary })
    );
  }

  return Math.max(
    getMinimumSubtreeSpanPx(node.first, axis, { preserveTrailingBoundary }),
    getMinimumSubtreeSpanPx(node.second, axis, { preserveTrailingBoundary }),
  );
}

function getLeafMinimumSpanPx(axis: SplitAxis, preserveTrailingBoundary: boolean): number {
  if (axis === "horizontal") {
    return MIN_PANE_WIDTH_PX;
  }

  return getVerticalLeafMinimum(preserveTrailingBoundary);
}

function getVerticalLeafMinimum(preserveTrailingBoundary: boolean): number {
  return preserveTrailingBoundary ? MIN_BOUNDARY_PANE_HEIGHT_PX : MIN_INTERIOR_PANE_HEIGHT_PX;
}
