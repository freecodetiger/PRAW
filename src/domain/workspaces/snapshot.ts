import { fromWindowSnapshot, toWindowSnapshot, type WindowSnapshot } from "../window/snapshot";
import type { WorkspaceCollection, WorkspaceEntry } from "./types";

export const WORKSPACE_COLLECTION_SNAPSHOT_VERSION = 1;

export interface WorkspaceEntrySnapshot {
  workspaceId: string;
  title: string;
  window: WindowSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceCollectionSnapshot {
  version: typeof WORKSPACE_COLLECTION_SNAPSHOT_VERSION;
  activeWorkspaceId: string;
  nextWorkspaceNumber: number;
  workspaces: WorkspaceEntrySnapshot[];
}

export function toWorkspaceCollectionSnapshot(collection: WorkspaceCollection): WorkspaceCollectionSnapshot {
  return {
    version: WORKSPACE_COLLECTION_SNAPSHOT_VERSION,
    activeWorkspaceId: collection.activeWorkspaceId,
    nextWorkspaceNumber: collection.nextWorkspaceNumber,
    workspaces: collection.workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      title: workspace.title,
      window: toWindowSnapshot(workspace.window),
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    })),
  };
}

export function fromWorkspaceCollectionSnapshot(snapshot: WorkspaceCollectionSnapshot): WorkspaceCollection {
  return {
    version: WORKSPACE_COLLECTION_SNAPSHOT_VERSION,
    activeWorkspaceId: snapshot.activeWorkspaceId,
    nextWorkspaceNumber: snapshot.nextWorkspaceNumber,
    workspaces: snapshot.workspaces.map((workspace): WorkspaceEntry => ({
      workspaceId: workspace.workspaceId,
      title: workspace.title,
      window: fromWindowSnapshot(workspace.window),
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    })),
  };
}
