import type { WindowModel } from "../window/types";

export interface WorkspaceEntry {
  workspaceId: string;
  title: string;
  window: WindowModel;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceCollection {
  version: 1;
  activeWorkspaceId: string;
  nextWorkspaceNumber: number;
  workspaces: WorkspaceEntry[];
}
