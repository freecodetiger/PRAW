import type { TabModel } from "../../../domain/window/types";

export function shouldConfirmBeforeClosingTab(tab: Pick<TabModel, "status" | "sessionId">): boolean {
  return tab.status === "running" || Boolean(tab.sessionId);
}
