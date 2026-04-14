import type { CSSProperties } from "react";

import type { SplitAxis } from "../../../domain/layout/types";

export interface PaneBorderMask {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export function getDividerOverlapStyle(axis: SplitAxis): CSSProperties {
  return {
    margin: axis === "horizontal" ? "0 -3px" : "-3px 0",
  };
}

export function getChildBorderMask(
  mask: PaneBorderMask,
  axis: SplitAxis,
  index: number,
  total: number,
): PaneBorderMask {
  if (axis === "horizontal") {
    return compactMask({
      ...mask,
      left: index > 0 ? true : mask.left,
      right: index < total - 1 ? true : mask.right,
    });
  }

  return compactMask({
    ...mask,
    top: index > 0 ? true : mask.top,
    bottom: index < total - 1 ? true : mask.bottom,
  });
}

export function splitPaneBorderMask(
  mask: PaneBorderMask,
  axis: SplitAxis,
): { first: PaneBorderMask; second: PaneBorderMask } {
  return {
    first: getChildBorderMask(mask, axis, 0, 2),
    second: getChildBorderMask(mask, axis, 1, 2),
  };
}

function compactMask(mask: PaneBorderMask): PaneBorderMask {
  return Object.fromEntries(Object.entries(mask).filter(([, value]) => value === true)) as PaneBorderMask;
}
