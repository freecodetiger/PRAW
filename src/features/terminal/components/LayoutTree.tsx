import { Fragment, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

import { type PaneResizeEdge, type PaneResizeTarget } from "../../../domain/layout/edge-resize";
import type { LayoutFrame } from "../../../domain/layout/geometry";
import { getNodeLeafId } from "../../../domain/layout/tree";
import type { ContainerNode, LayoutNode } from "../../../domain/layout/types";
import { beginAxisMouseDrag } from "../lib/axis-drag";
import { getChildBorderMask, getDividerOverlapStyle, type PaneBorderMask } from "../lib/layout-presentation";
import { getPaneResizeHandleStyle, getPaneResizeHandles } from "../lib/pane-resize-handles";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalPane } from "./TerminalPane";

interface LayoutTreeProps {
  node: LayoutNode;
  frame: LayoutFrame;
  borderMask?: PaneBorderMask;
}

export function LayoutTree({ node, frame, borderMask = {} }: LayoutTreeProps) {
  if (node.kind === "pane") {
    return <PaneLeafFrame tabId={getNodeLeafId(node)} frame={frame} borderMask={borderMask} />;
  }

  return <ContainerLayoutTree node={node} frame={frame} borderMask={borderMask} />;
}

function PaneLeafFrame({ tabId, frame, borderMask }: { tabId: string; frame: LayoutFrame; borderMask: PaneBorderMask }) {
  const layout = useWorkspaceStore((state) => state.window?.layout ?? null);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  const [activeResizeEdge, setActiveResizeEdge] = useState<PaneResizeEdge | null>(null);
  const resizeHandles = layout ? getPaneResizeHandles(layout, tabId) : [];

  const startEdgeResize =
    (edge: PaneResizeEdge, target: PaneResizeTarget) => (event: ReactMouseEvent<HTMLDivElement>) => {
      setActiveTab(tabId);
      setActiveResizeEdge(edge);
      document.body.style.cursor = target.axis === "horizontal" ? "col-resize" : "row-resize";

      beginAxisMouseDrag({
        axis: target.axis,
        startEvent: event,
        onDelta: (deltaPx) => {
          resizeSplit(target.containerId, target.dividerIndex, deltaPx, frame);
        },
        onEnd: () => {
          setActiveResizeEdge(null);
          document.body.style.removeProperty("cursor");
        },
      });
    };

  return (
    <div className="layout-tree__leaf-frame" data-pane-id={tabId}>
      <TerminalPane tabId={tabId} borderMask={borderMask} />
      {resizeHandles.length > 0 ? (
        <div className="layout-tree__leaf-resize-handles" aria-hidden="true">
          {resizeHandles.map(({ edge, target }) => (
            <div
              key={edge}
              className={`terminal-pane__resize-handle terminal-pane__resize-handle--${edge}${activeResizeEdge === edge ? " terminal-pane__resize-handle--active" : ""}`}
              style={getPaneResizeHandleStyle(edge)}
              data-resize-edge={edge}
              onMouseDown={startEdgeResize(edge, target)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContainerLayoutTree({ node, frame, borderMask }: { node: ContainerNode; frame: LayoutFrame; borderMask: PaneBorderMask }) {
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeDividerIndex, setActiveDividerIndex] = useState<number | null>(null);

  const handlePointerDown = (dividerIndex: number) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    setActiveDividerIndex(dividerIndex);

    beginAxisMouseDrag({
      axis: node.axis,
      startEvent: event,
      onDelta: (deltaPx) => {
        resizeSplit(node.id, dividerIndex, deltaPx, frame);
      },
      onEnd: () => {
        setActiveDividerIndex(null);
      },
    });
  };

  return (
    <div
      ref={containerRef}
      className={`layout-tree layout-tree--${node.axis}${activeDividerIndex !== null ? " layout-tree--resizing" : ""}`}
      data-layout-node-id={node.id}
    >
      {node.children.map((child, index) => {
        const branchStyle = {
          flexGrow: node.sizes[index] ?? 1,
        } as CSSProperties;
        const childMask = getChildBorderMask(borderMask, node.axis, index, node.children.length);

        return (
          <Fragment key={child.id}>
            <div className="layout-tree__branch" style={branchStyle}>
              <LayoutTree node={child} frame={frame} borderMask={childMask} />
            </div>
            {index < node.children.length - 1 ? (
              <button
                className={`layout-tree__divider layout-tree__divider--${node.axis}`}
                type="button"
                aria-label={`Resize ${node.axis} split ${index + 1}`}
                style={getDividerOverlapStyle(node.axis)}
                onMouseDown={handlePointerDown(index)}
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
