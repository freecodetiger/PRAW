import { normalizeWorkspaceSnapshot } from "../workspace/restore";
import type { WindowSnapshot } from "./snapshot";

export function normalizeWindowSnapshot(snapshot: WindowSnapshot | null | undefined): WindowSnapshot | null {
  if (!snapshot || !Array.isArray(snapshot.tabs) || snapshot.tabs.length === 0) {
    return null;
  }

  const tabMap = new Map<string, WindowSnapshot["tabs"][number]>();
  for (const tab of snapshot.tabs) {
    if (!tab || typeof tab.tabId !== "string" || tab.tabId.trim().length === 0) {
      continue;
    }

    if (tabMap.has(tab.tabId)) {
      return null;
    }

    const workspace = normalizeWorkspaceSnapshot(tab.workspace);
    if (!workspace) {
      continue;
    }

    tabMap.set(tab.tabId, {
      tabId: tab.tabId,
      title: typeof tab.title === "string" && tab.title.trim().length > 0 ? tab.title : tab.tabId,
      workspace,
    });
  }

  const tabOrder = snapshot.tabOrder.filter((tabId) => tabMap.has(tabId));
  if (tabOrder.length === 0) {
    return null;
  }

  const tabs = tabOrder.map((tabId) => tabMap.get(tabId)).filter((tab): tab is NonNullable<typeof tab> => tab !== undefined);

  return {
    tabs,
    tabOrder,
    activeTabId: tabOrder.includes(snapshot.activeTabId) ? snapshot.activeTabId : tabOrder[0],
    nextTabNumber:
      typeof snapshot.nextTabNumber === "number" && Number.isFinite(snapshot.nextTabNumber)
        ? Math.max(inferNextTabNumber(tabOrder), Math.round(snapshot.nextTabNumber))
        : inferNextTabNumber(tabOrder),
  };
}

function inferNextTabNumber(tabIds: string[]): number {
  return tabIds.reduce((maxValue, tabId) => {
    const match = /^tab:(\d+)$/.exec(tabId);
    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]) + 1);
  }, 2);
}
