import { useEffect, useState } from "react";

import { countLeaves } from "../../../domain/layout/tree";
import type { PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { selectTerminalBuffer, selectTerminalTabState, useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";
import { DialogTerminalSurface } from "./DialogTerminalSurface";

interface TerminalPaneProps {
  tabId: string;
}

interface ContextMenuState {
  x: number;
  y: number;
}

export function TerminalPane({ tabId }: TerminalPaneProps) {
  const isActive = useWorkspaceStore((state) => state.window?.activeTabId === tabId);
  const canClose = useWorkspaceStore((state) => (state.window ? countLeaves(state.window.layout) > 1 : false));
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const splitTab = useWorkspaceStore((state) => state.splitTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const dragState = useWorkspaceStore((state) => state.dragState);
  const dragPreview = useWorkspaceStore((state) => state.dragPreview);
  const beginTabDrag = useWorkspaceStore((state) => state.beginTabDrag);
  const setDragPreview = useWorkspaceStore((state) => state.setDragPreview);
  const applyDragPreview = useWorkspaceStore((state) => state.applyDragPreview);
  const clearPaneDrag = useWorkspaceStore((state) => state.clearPaneDrag);
  const fontFamily = useAppConfigStore((state) => state.config.terminal.fontFamily);
  const fontSize = useAppConfigStore((state) => state.config.terminal.fontSize);
  const bufferedOutput = useTerminalViewStore((state) => selectTerminalBuffer(state.buffers, tabId));
  const tabState = useTerminalViewStore((state) => selectTerminalTabState(state.tabStates, tabId));
  const submitCommand = useTerminalViewStore((state) => state.submitCommand);
  const { tab, currentStreamSessionId, write, resize, restart } = useTerminalSession(tabId);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const isDragSource = dragState?.sourceTabId === tabId;
  const previewEdge =
    dragPreview?.targetLeafId === tabId ? toPreviewEdge(dragPreview.axis, dragPreview.order) : null;
  const renderMode = tabState?.mode ?? "classic";

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => {
      setContextMenu(null);
    };

    window.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", close);

    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  if (!tab) {
    return <div className="empty-state">Tab not found.</div>;
  }

  const runSplitAction = (axis: SplitAxis) => {
    setContextMenu(null);
    splitTab(tabId, axis);
  };

  return (
    <section
      className={`terminal-pane${isActive ? " terminal-pane--active" : ""}${isDragSource ? " terminal-pane--drag-source" : ""}`}
      onMouseDown={() => {
        setActiveTab(tabId);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setActiveTab(tabId);
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <div
        className="terminal-pane__header"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tabId);
          beginTabDrag(tabId);
        }}
        onDragEnd={() => clearPaneDrag()}
      >
        <div className="terminal-pane__title">
          <strong>{tab.title}</strong>
        </div>

        <button
          className="terminal-pane__close"
          type="button"
          aria-label={`Close ${tab.title}`}
          disabled={!canClose}
          onClick={(event) => {
            event.stopPropagation();
            closeTab(tabId);
          }}
        >
          ×
        </button>
      </div>

      {renderMode === "dialog" && tabState ? (
        <DialogTerminalSurface
          paneState={tabState}
          status={tab.status}
          isActive={Boolean(isActive)}
          onSubmitCommand={(command) => {
            submitCommand(tabId, command);
            void write(`${command}\n`);
          }}
        />
      ) : (
        <ClassicTerminalSurface
          sessionId={currentStreamSessionId}
          bufferedOutput={bufferedOutput}
          fontFamily={fontFamily}
          fontSize={fontSize}
          write={write}
          resize={resize}
        />
      )}

      {dragState && !isDragSource ? (
        <div className="terminal-pane__drop-targets" aria-hidden="true">
          {(["left", "right", "top", "bottom"] as PaneDropEdge[]).map((edge) => (
            <div
              key={edge}
              className={`terminal-pane__drop-zone terminal-pane__drop-zone--${edge}${previewEdge === edge ? " terminal-pane__drop-zone--active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragPreview(tabId, edge);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragPreview(tabId, edge);
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyDragPreview();
              }}
            />
          ))}
        </div>
      ) : null}

      {previewEdge ? <div className={`terminal-pane__drop-preview terminal-pane__drop-preview--${previewEdge}`} /> : null}

      {contextMenu ? (
        <div
          className="pane-context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <button className="pane-context-menu__item" type="button" onClick={() => runSplitAction("horizontal")}>
            Split Right
          </button>
          <button className="pane-context-menu__item" type="button" onClick={() => runSplitAction("vertical")}>
            Split Down
          </button>
          <button
            className="pane-context-menu__item"
            type="button"
            disabled={!canClose}
            onClick={() => {
              setContextMenu(null);
              closeTab(tabId);
            }}
          >
            Close Tab
          </button>
          <button
            className="pane-context-menu__item"
            type="button"
            onClick={() => {
              setContextMenu(null);
              void restart();
            }}
          >
            Restart Shell
          </button>
        </div>
      ) : null}

      {(tab.status === "error" || tab.status === "exited") && (
        <div className="terminal-pane__overlay">
          <h2>{tab.status === "error" ? "Session failed" : "Session exited"}</h2>
          <p>
            {tab.error ?? `Exit code: ${tab.exitCode ?? "unknown"}${tab.signal ? ` · ${tab.signal}` : ""}`}
          </p>
          <button className="button button--danger" type="button" onClick={() => void restart()}>
            Start a fresh shell
          </button>
        </div>
      )}
    </section>
  );
}

function toPreviewEdge(axis: "horizontal" | "vertical", order: "before" | "after"): PaneDropEdge {
  if (axis === "horizontal") {
    return order === "before" ? "left" : "right";
  }

  return order === "before" ? "top" : "bottom";
}
