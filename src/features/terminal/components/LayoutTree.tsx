import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { LayoutNode, SplitNode } from "../../../domain/layout/types";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalPane } from "./TerminalPane";

interface LayoutTreeProps {
  tabId: string;
  node: LayoutNode;
}

export function LayoutTree({ tabId, node }: LayoutTreeProps) {
  if (node.kind === "leaf") {
    return <TerminalPane tabId={tabId} paneId={node.paneId} />;
  }

  return <SplitLayoutTree tabId={tabId} node={node} />;
}

function SplitLayoutTree({ tabId, node }: { tabId: string; node: SplitNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  const [isResizing, setIsResizing] = useState(false);

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
        resizeSplit(node.id, (clientX - rect.left) / rect.width);
        return;
      }

      if (node.axis === "vertical" && rect.height > 0) {
        resizeSplit(node.id, (clientY - rect.top) / rect.height);
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
        <LayoutTree tabId={tabId} node={node.first} />
      </div>
      <button
        className={`layout-tree__divider layout-tree__divider--${node.axis}`}
        type="button"
        aria-label={`Resize ${node.axis} split`}
        onPointerDown={handlePointerDown}
      />
      <div className="layout-tree__branch">
        <LayoutTree tabId={tabId} node={node.second} />
      </div>
    </div>
  );
}
