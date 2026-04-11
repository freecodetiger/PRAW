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

export function splitPaneBorderMask(
  mask: PaneBorderMask,
  axis: SplitAxis,
): { first: PaneBorderMask; second: PaneBorderMask } {
  if (axis === "horizontal") {
    return {
      first: {
        ...mask,
        right: true,
      },
      second: { ...mask },
    };
  }

  return {
    first: {
      ...mask,
      bottom: true,
    },
    second: { ...mask },
  };
}
