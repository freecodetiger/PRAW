import { collectLeafIds } from "../layout/tree";
import type { LayoutNode } from "../layout/types";
import type { WindowModel } from "./types";

export interface TabSnapshot {
  tabId: string;
  title: string;
  shell: string;
  cwd: string;
}

export interface WindowSnapshot {
  layout: LayoutNode;
  tabs: TabSnapshot[];
  activeTabId: string;
  nextTabNumber: number;
}

export function toWindowSnapshot(window: WindowModel): WindowSnapshot {
  return {
    layout: window.layout,
    tabs: collectLeafIds(window.layout)
      .map((tabId) => window.tabs[tabId])
      .filter((tab): tab is NonNullable<typeof tab> => tab !== undefined)
      .map((tab) => ({
        tabId: tab.tabId,
        title: tab.title,
        shell: tab.shell,
        cwd: tab.cwd,
      })),
    activeTabId: window.activeTabId,
    nextTabNumber: window.nextTabNumber,
  };
}

export function fromWindowSnapshot(snapshot: WindowSnapshot): WindowModel {
  return {
    layout: snapshot.layout,
    tabs: Object.fromEntries(
      snapshot.tabs.map((tab) => [
        tab.tabId,
        {
          ...tab,
          status: "starting" as const,
          sessionId: undefined,
          error: undefined,
          exitCode: null,
          signal: null,
        },
      ]),
    ),
    activeTabId: snapshot.activeTabId,
    nextTabNumber: snapshot.nextTabNumber,
  };
}
