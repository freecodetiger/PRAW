export type SplitAxis = "horizontal" | "vertical";
export type FocusDirection = "left" | "right" | "up" | "down";
export type LeafDropEdge = "left" | "right" | "top" | "bottom";
export type DropOrder = "before" | "after";

export interface SplitNode {
  kind: "split";
  id: string;
  axis: SplitAxis;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LeafNode =
  | {
      kind: "leaf";
      id: string;
      leafId: string;
    }
  | {
      kind: "leaf";
      id: string;
      paneId: string;
    };

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

export type LayoutNode = SplitNode | LeafNode;
