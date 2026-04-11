import type { DialogState } from "../../../domain/terminal/dialog";
import type { TabModel } from "../../../domain/window/types";

export function shouldConfirmBeforeClosingTab(
  tab: Pick<TabModel, "status" | "sessionId">,
  tabState?: Pick<DialogState, "activeCommandBlockId" | "shellIntegration"> | null,
): boolean {
  if (tab.status !== "running" || !tab.sessionId) {
    return false;
  }

  if (!tabState) {
    return true;
  }

  if (tabState.shellIntegration === "unsupported") {
    return true;
  }

  return tabState.activeCommandBlockId !== null;
}
