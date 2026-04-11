import type { WorkspaceSnapshot } from "../workspace/snapshot";
import { fromWorkspaceSnapshot, toWorkspaceSnapshot } from "../workspace/snapshot";
import type { WindowModel } from "./types";

export interface TabSnapshot {
  tabId: string;
  title: string;
  workspace: WorkspaceSnapshot;
}

export interface WindowSnapshot {
  tabs: TabSnapshot[];
  tabOrder: string[];
  activeTabId: string;
  nextTabNumber: number;
}

export function toWindowSnapshot(window: WindowModel): WindowSnapshot {
  return {
    tabs: window.tabOrder
      .map((tabId) => window.tabs[tabId])
      .filter((tab): tab is NonNullable<typeof tab> => tab !== undefined)
      .map((tab) => ({
        tabId: tab.tabId,
        title: tab.title,
        workspace: toWorkspaceSnapshot(tab.workspace),
      })),
    tabOrder: window.tabOrder.filter((tabId) => window.tabs[tabId] !== undefined),
    activeTabId: window.activeTabId,
    nextTabNumber: window.nextTabNumber,
  };
}

export function fromWindowSnapshot(snapshot: WindowSnapshot): WindowModel {
  return {
    tabs: Object.fromEntries(
      snapshot.tabs.map((tab) => [
        tab.tabId,
        {
          tabId: tab.tabId,
          title: tab.title,
          workspace: fromWorkspaceSnapshot(tab.workspace),
        },
      ]),
    ),
    tabOrder: snapshot.tabOrder,
    activeTabId: snapshot.activeTabId,
    nextTabNumber: snapshot.nextTabNumber,
  };
}
