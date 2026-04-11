import { useMemo } from "react";

import { useAppConfigStore } from "../../config/state/app-config-store";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { selectTerminalBuffer, selectTerminalPaneState, useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";
import { DialogTerminalSurface } from "./DialogTerminalSurface";
import type { PaneDropEdge } from "../../../domain/layout/types";

interface TerminalPaneProps {
  tabId: string;
  paneId: string;
}

function getStatusLabel(status: NonNullable<ReturnType<typeof useTerminalSession>["pane"]>["status"]): string {
  switch (status) {
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "exited":
      return "Exited";
    case "error":
      return "Error";
  }
}

export function TerminalPane({ tabId, paneId }: TerminalPaneProps) {
  const isActive = useWorkspaceStore((state) => state.window?.tabs[tabId]?.workspace.activePaneId === paneId);
  const canClose = useWorkspaceStore((state) => {
    const workspace = state.window?.tabs[tabId]?.workspace;
    return workspace ? Object.keys(workspace.panes).length > 1 : false;
  });
  const setActivePane = useWorkspaceStore((state) => state.setActivePane);
  const splitWorkspacePane = useWorkspaceStore((state) => state.splitPane);
  const closeWorkspacePane = useWorkspaceStore((state) => state.closePane);
  const dragState = useWorkspaceStore((state) => state.dragState);
  const dragPreview = useWorkspaceStore((state) => state.dragPreview);
  const beginPaneDrag = useWorkspaceStore((state) => state.beginPaneDrag);
  const setDragPreview = useWorkspaceStore((state) => state.setDragPreview);
  const applyDragPreview = useWorkspaceStore((state) => state.applyDragPreview);
  const clearPaneDrag = useWorkspaceStore((state) => state.clearPaneDrag);
  const fontFamily = useAppConfigStore((state) => state.config.terminal.fontFamily);
  const fontSize = useAppConfigStore((state) => state.config.terminal.fontSize);
  const bufferedOutput = useTerminalViewStore((state) => selectTerminalBuffer(state.buffers, tabId, paneId));
  const paneState = useTerminalViewStore((state) => selectTerminalPaneState(state.paneStates, tabId, paneId));
  const submitCommand = useTerminalViewStore((state) => state.submitCommand);
  const setPaneMode = useTerminalViewStore((state) => state.setPaneMode);

  const { pane, currentStreamSessionId, write, resize, restart } = useTerminalSession(tabId, paneId);
  const isDragSource = dragState?.sourcePaneId === paneId;
  const previewEdge =
    dragPreview?.targetPaneId === paneId ? toPreviewEdge(dragPreview.axis, dragPreview.order) : null;

  const statusClassName = useMemo(() => `status-pill status-pill--${pane?.status ?? "starting"}`, [pane?.status]);
  const renderMode = paneState?.mode ?? "classic";
  const canUseDialog = paneState?.shellIntegration === "supported";
  const dialogToggleLocked = paneState?.modeSource === "auto-interactive" && paneState.activeCommandBlockId !== null;

  if (!pane) {
    return <div className="empty-state">Pane not found.</div>;
  }

  return (
    <section
      className={`terminal-pane${isActive ? " terminal-pane--active" : ""}${isDragSource ? " terminal-pane--drag-source" : ""}`}
      onMouseDown={() => {
        setActivePane(paneId);
      }}
    >
      <div className="terminal-pane__chrome">
        <div className="terminal-pane__title">
          <strong>{pane.title}</strong>
          <p>
            {pane.shell} · {paneState?.cwd ?? pane.cwd}
          </p>
          <p>{renderMode === "dialog" ? "dialog transcript" : "classic terminal"} · buffered session output</p>
        </div>

        <div className="terminal-pane__status">
          <span className={statusClassName}>{getStatusLabel(pane.status)}</span>
          <button
            className={`button button--ghost${renderMode === "dialog" ? " button--active" : ""}`}
            type="button"
            disabled={!canUseDialog || dialogToggleLocked}
            onClick={() => setPaneMode(tabId, paneId, "dialog", "manual")}
          >
            Dialog
          </button>
          <button
            className={`button button--ghost${renderMode === "classic" ? " button--active" : ""}`}
            type="button"
            onClick={() => setPaneMode(tabId, paneId, "classic", "manual")}
          >
            Classic
          </button>
          <button
            className="button button--ghost"
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", paneId);
              beginPaneDrag(paneId);
            }}
            onDragEnd={() => clearPaneDrag()}
          >
            Drag
          </button>
          <button className="button" type="button" onClick={() => splitWorkspacePane(paneId, "horizontal")}>
            Split H
          </button>
          <button className="button" type="button" onClick={() => splitWorkspacePane(paneId, "vertical")}>
            Split V
          </button>
          <button className="button" type="button" onClick={() => void restart()}>
            Restart
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={!canClose}
            onClick={() => closeWorkspacePane(paneId)}
          >
            Close
          </button>
        </div>
      </div>

      {renderMode === "dialog" && paneState ? (
        <DialogTerminalSurface
          paneState={paneState}
          status={pane.status}
          isActive={Boolean(isActive)}
          onSubmitCommand={(command) => {
            submitCommand(tabId, paneId, command);
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
                setDragPreview(paneId, edge);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragPreview(paneId, edge);
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyDragPreview();
              }}
            />
          ))}
        </div>
      ) : null}

      {previewEdge ? (
        <div className={`terminal-pane__drop-preview terminal-pane__drop-preview--${previewEdge}`}>
          <span>Preview only</span>
        </div>
      ) : null}

      {!canUseDialog ? (
        <div className="terminal-pane__notice">
          Dialog mode is available for bash sessions only. This pane stays in classic terminal mode.
        </div>
      ) : null}

      {(pane.status === "error" || pane.status === "exited") && (
        <div className="terminal-pane__overlay">
          <h2>{pane.status === "error" ? "Session failed" : "Session exited"}</h2>
          <p>
            {pane.error ?? `Exit code: ${pane.exitCode ?? "unknown"}${pane.signal ? ` · ${pane.signal}` : ""}`}
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
