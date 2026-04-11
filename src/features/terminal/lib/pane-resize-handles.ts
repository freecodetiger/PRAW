import type { CSSProperties } from "react";

import { findPaneResizeTarget, type PaneResizeEdge, type PaneResizeTarget } from "../../../domain/layout/edge-resize";
import type { LayoutNode } from "../../../domain/layout/types";

export const PANE_RESIZE_HANDLE_THICKNESS_PX = 14;
export const PANE_RESIZE_HANDLE_OVERLAP_PX = Math.floor(PANE_RESIZE_HANDLE_THICKNESS_PX / 2);

export interface PaneResizeHandleDefinition {
  edge: PaneResizeEdge;
  target: PaneResizeTarget;
}

export function getPaneResizeHandles(layout: LayoutNode, paneId: string): PaneResizeHandleDefinition[] {
  return (["left", "right", "top", "bottom"] as PaneResizeEdge[])
    .map((edge) => ({
      edge,
      target: findPaneResizeTarget(layout, paneId, edge),
    }))
    .filter((entry): entry is PaneResizeHandleDefinition => entry.target !== null);
}

export function getPaneResizeHandleStyle(edge: PaneResizeEdge): CSSProperties {
  switch (edge) {
    case "left":
      return {
        top: 0,
        bottom: 0,
        left: -PANE_RESIZE_HANDLE_OVERLAP_PX,
        width: PANE_RESIZE_HANDLE_THICKNESS_PX,
      };
    case "right":
      return {
        top: 0,
        bottom: 0,
        right: -PANE_RESIZE_HANDLE_OVERLAP_PX,
        width: PANE_RESIZE_HANDLE_THICKNESS_PX,
      };
    case "top":
      return {
        left: 0,
        right: 0,
        top: -PANE_RESIZE_HANDLE_OVERLAP_PX,
        height: PANE_RESIZE_HANDLE_THICKNESS_PX,
      };
    case "bottom":
      return {
        left: 0,
        right: 0,
        bottom: -PANE_RESIZE_HANDLE_OVERLAP_PX,
        height: PANE_RESIZE_HANDLE_THICKNESS_PX,
      };
  }
}
