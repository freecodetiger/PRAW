export type SplitAxis = "horizontal" | "vertical";
export type FocusDirection = "left" | "right" | "up" | "down";
export type PaneDropEdge = "left" | "right" | "top" | "bottom";
export type PaneDropOrder = "before" | "after";

export interface SplitNode {
  kind: "split";
  id: string;
  axis: SplitAxis;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export interface LeafNode {
  kind: "leaf";
  id: string;
  paneId: string;
}

export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaneDragPreview {
  sourcePaneId: string;
  targetPaneId: string;
  axis: SplitAxis;
  order: PaneDropOrder;
}

export type LayoutNode = SplitNode | LeafNode;
