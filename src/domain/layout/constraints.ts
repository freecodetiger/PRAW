import {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  SPLIT_DIVIDER_SIZE_PX,
} from "./geometry";
import type { LayoutNode, SplitAxis } from "./types";

export {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  SPLIT_DIVIDER_SIZE_PX,
} from "./geometry";

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
  const bottomMinimum = options.preserveTrailingBoundary ? MIN_BOUNDARY_PANE_HEIGHT_PX : MIN_INTERIOR_PANE_HEIGHT_PX;
  return sizePx >= topMinimum + bottomMinimum + SPLIT_DIVIDER_SIZE_PX;
}

export function getMinimumSubtreeSpanPx(
  node: LayoutNode,
  axis: SplitAxis,
  options: AxisConstraintOptions = {},
): number {
  if (node.kind === "pane") {
    return axis === "horizontal"
      ? MIN_PANE_WIDTH_PX
      : options.preserveTrailingBoundary
        ? MIN_BOUNDARY_PANE_HEIGHT_PX
        : MIN_INTERIOR_PANE_HEIGHT_PX;
  }

  if (node.axis === axis) {
    return (
      node.children.reduce((sum, child, index) => {
        const childOptions = {
          preserveTrailingBoundary: index === node.children.length - 1 ? options.preserveTrailingBoundary : false,
        };
        return sum + getMinimumSubtreeSpanPx(child, axis, childOptions);
      }, 0) + Math.max(0, node.children.length - 1) * SPLIT_DIVIDER_SIZE_PX
    );
  }

  return node.children.reduce((maxValue, child, index) => {
    const childOptions = {
      preserveTrailingBoundary: index === node.children.length - 1 ? options.preserveTrailingBoundary : false,
    };
    return Math.max(maxValue, getMinimumSubtreeSpanPx(child, axis, childOptions));
  }, 0);
}

export function constrainSplitRatio(
  node: LayoutNode,
  containerSizePx: number,
  requestedRatio: number,
  options: AxisConstraintOptions = {},
): number {
  const childCount = node.kind === "pane" ? 0 : node.children.length;
  if (childCount < 2 || childCount > 2 || Number.isFinite(requestedRatio) === false) {
    return 0.5;
  }

  const availableSizePx = containerSizePx - SPLIT_DIVIDER_SIZE_PX;
  if (availableSizePx <= 0) {
    return 0.5;
  }

  if (node.kind === "pane") {
    return 0.5;
  }

  const container = node;
  const firstMinimum = getMinimumSubtreeSpanPx(container.children[0], container.axis, { preserveTrailingBoundary: false });
  const secondMinimum = getMinimumSubtreeSpanPx(container.children[1], container.axis, {
    preserveTrailingBoundary: options.preserveTrailingBoundary,
  });
  const minimumRatio = firstMinimum / availableSizePx;
  const maximumRatio = 1 - secondMinimum / availableSizePx;
  if (minimumRatio > maximumRatio) {
    return 0.5;
  }

  return Math.min(maximumRatio, Math.max(minimumRatio, requestedRatio));
}
