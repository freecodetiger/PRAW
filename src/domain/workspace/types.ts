import type { LayoutNode } from "../layout/types";
import type { TerminalSessionStatus } from "../terminal/types";

export interface PaneModel {
  paneId: string;
  title: string;
  shell: string;
  cwd: string;
  status: TerminalSessionStatus;
  sessionId?: string;
  error?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface WorkspaceModel {
  layout: LayoutNode;
  activePaneId: string;
  panes: Record<string, PaneModel>;
  nextPaneNumber: number;
}
