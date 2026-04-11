import type { LayoutNode } from "../layout/types";
import type { WorkspaceModel } from "./types";

export interface PaneSnapshot {
  paneId: string;
  title: string;
  shell: string;
  cwd: string;
}

export interface WorkspaceSnapshot {
  layout: LayoutNode;
  activePaneId: string;
  nextPaneNumber: number;
  panes: PaneSnapshot[];
}

export function toWorkspaceSnapshot(workspace: WorkspaceModel): WorkspaceSnapshot {
  return {
    layout: workspace.layout,
    activePaneId: workspace.activePaneId,
    nextPaneNumber: workspace.nextPaneNumber,
    panes: Object.values(workspace.panes).map((pane) => ({
      paneId: pane.paneId,
      title: pane.title,
      shell: pane.shell,
      cwd: pane.cwd,
    })),
  };
}

export function fromWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceModel {
  return {
    layout: snapshot.layout,
    activePaneId: snapshot.activePaneId,
    nextPaneNumber: snapshot.nextPaneNumber,
    panes: Object.fromEntries(
      snapshot.panes.map((pane) => [
        pane.paneId,
        {
          ...pane,
          status: "starting" as const,
          sessionId: undefined,
          error: undefined,
          exitCode: null,
          signal: null,
        },
      ]),
    ),
  };
}
