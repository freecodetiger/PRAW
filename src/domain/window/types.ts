import type { WorkspaceModel } from "../workspace/types";

export interface TabModel {
  tabId: string;
  title: string;
  workspace: WorkspaceModel;
}

export interface WindowModel {
  tabs: Record<string, TabModel>;
  tabOrder: string[];
  activeTabId: string;
  nextTabNumber: number;
}
