import type { LayoutNode, SplitAxis } from "./types";

export type PaneResizeEdge = "left" | "right" | "top" | "bottom";

export interface PaneResizeTarget {
  containerId: string;
  dividerIndex: number;
  axis: SplitAxis;
  edge: PaneResizeEdge;
}

export function findPaneResizeTarget(
  node: LayoutNode,
  paneId: string,
  edge: PaneResizeEdge,
): PaneResizeTarget | null {
  return findPaneResizeTargetInternal(node, paneId, edge).target;
}

function findPaneResizeTargetInternal(
  node: LayoutNode,
  paneId: string,
  edge: PaneResizeEdge,
): { containsPane: boolean; target: PaneResizeTarget | null } {
  if (node.kind === "pane") {
    return {
      containsPane: node.paneId === paneId,
      target: null,
    };
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const result = findPaneResizeTargetInternal(node.children[index], paneId, edge);
    if (result.containsPane === false) {
      continue;
    }

    if (result.target !== null) {
      return result;
    }

    const axis = edge === "left" || edge === "right" ? "horizontal" : "vertical";
    if (node.axis === axis) {
      if ((edge === "left" || edge === "top") && index > 0) {
        return {
          containsPane: true,
          target: {
            containerId: node.id,
            dividerIndex: index - 1,
            axis,
            edge,
          },
        };
      }

      if ((edge === "right" || edge === "bottom") && index < node.children.length - 1) {
        return {
          containsPane: true,
          target: {
            containerId: node.id,
            dividerIndex: index,
            axis,
            edge,
          },
        };
      }
    }

    return {
      containsPane: true,
      target: null,
    };
  }

  return {
    containsPane: false,
    target: null,
  };
}
