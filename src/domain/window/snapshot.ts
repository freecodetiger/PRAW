import { collectLeafIds } from "../layout/tree";
import type { LayoutNode } from "../layout/types";
import type { WindowModel } from "./types";

export const WINDOW_SNAPSHOT_VERSION = 2;

export interface TabSnapshot {
  tabId: string;
  title: string;
  note?: string;
  shell: string;
  cwd: string;
}

export interface WindowSnapshot {
  version: typeof WINDOW_SNAPSHOT_VERSION;
  layout: LayoutNode;
  tabs: TabSnapshot[];
  activeTabId: string;
  nextTabNumber: number;
}

export function toWindowSnapshot(window: WindowModel): WindowSnapshot {
  return {
    version: WINDOW_SNAPSHOT_VERSION,
    layout: window.layout,
    tabs: collectLeafIds(window.layout)
      .map((tabId) => window.tabs[tabId])
      .filter((tab): tab is NonNullable<typeof tab> => tab !== null && typeof tab === "object")
      .map((tab) => ({
        tabId: tab.tabId,
        title: tab.title,
        note: tab.note,
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
