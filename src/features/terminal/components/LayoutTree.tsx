import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { getNodeLeafId } from "../../../domain/layout/tree";
import { constrainSplitRatio } from "../../../domain/layout/constraints";
import type { LayoutNode, SplitNode } from "../../../domain/layout/types";
import { getDividerOverlapStyle, splitPaneBorderMask, type PaneBorderMask } from "../lib/layout-presentation";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalPane } from "./TerminalPane";

interface LayoutTreeProps {
  node: LayoutNode;
  borderMask?: PaneBorderMask;
}

export function LayoutTree({ node, borderMask = {} }: LayoutTreeProps) {
  if (node.kind === "leaf") {
    return <TerminalPane tabId={getNodeLeafId(node)} borderMask={borderMask} />;
  }

  return <SplitLayoutTree node={node} borderMask={borderMask} />;
}

function SplitLayoutTree({ node, borderMask }: { node: SplitNode; borderMask: PaneBorderMask }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  const [isResizing, setIsResizing] = useState(false);
  const childMasks = splitPaneBorderMask(borderMask, node.axis);

  const style = {
    "--split-ratio": String(node.ratio),
  } as CSSProperties;

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    event.preventDefault();
    setIsResizing(true);

    const updateRatio = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (node.axis === "horizontal" && rect.width > 0) {
        resizeSplit(node.id, constrainSplitRatio(node, rect.width, (clientX - rect.left) / rect.width, { preserveTrailingBoundary: !(borderMask.right ?? false) }));
        return;
      }

      if (node.axis === "vertical" && rect.height > 0) {
        resizeSplit(node.id, constrainSplitRatio(node, rect.height, (clientY - rect.top) / rect.height, { preserveTrailingBoundary: !(borderMask.bottom ?? false) }));
      }
    };

    updateRatio(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateRatio(moveEvent.clientX, moveEvent.clientY);
    };

    const stopResize = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  return (
    <div
      ref={containerRef}
      className={`layout-tree layout-tree--${node.axis}${isResizing ? " layout-tree--resizing" : ""}`}
      style={style}
      data-layout-node-id={node.id}
    >
      <div className="layout-tree__branch">
        <LayoutTree node={node.first} borderMask={childMasks.first} />
      </div>
      <button
        className={`layout-tree__divider layout-tree__divider--${node.axis}`}
        type="button"
        aria-label={`Resize ${node.axis} split`}
        style={getDividerOverlapStyle(node.axis)}
        onPointerDown={handlePointerDown}
      />
      <div className="layout-tree__branch">
        <LayoutTree node={node.second} borderMask={childMasks.second} />
      </div>
    </div>
  );
}
