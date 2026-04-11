export type SplitAxis = "horizontal" | "vertical";
export type FocusDirection = "left" | "right" | "up" | "down";
export type LeafDropEdge = "left" | "right" | "top" | "bottom";
export type DropOrder = "before" | "after";

export interface ContainerNode {
  kind: "container";
  id: string;
  axis: SplitAxis;
  children: LayoutNode[];
  sizes: number[];
}

export interface PaneNode {
  kind: "pane";
  id: string;
  paneId: string;
}

export interface LeafRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LeafDragPreview {
  sourceLeafId: string;
  targetLeafId: string;
  axis: SplitAxis;
  order: DropOrder;
  sourcePaneId?: string;
  targetPaneId?: string;
}

export type PaneDropEdge = LeafDropEdge;
export type PaneDropOrder = DropOrder;
export type PaneRect = LeafRect;
export type PaneDragPreview = LeafDragPreview;

export type LayoutNode = ContainerNode | PaneNode;
export type SplitNode = ContainerNode;
export type LeafNode = PaneNode;
