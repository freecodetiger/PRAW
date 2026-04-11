import { useEffect } from "react";

import { resolveWorkspaceShortcut } from "../../../domain/terminal/shortcuts";
import type { WindowModel } from "../../../domain/window/types";
import type { CreateTabRequest } from "../state/workspace-store";

interface UseWorkspaceShortcutsOptions {
  windowModel: WindowModel | null;
  createTab: (options: CreateTabRequest) => void;
  closeTab: (tabId: string) => void;
  focusAdjacentPane: (direction: "left" | "right" | "up" | "down") => void;
  startRenameActiveTab: () => void;
  tabDefaults: CreateTabRequest;
}

export function useWorkspaceShortcuts({
  windowModel,
  createTab,
  closeTab,
  focusAdjacentPane,
  startRenameActiveTab,
  tabDefaults,
}: UseWorkspaceShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const action = resolveWorkspaceShortcut(event);
      if (!action) {
        return;
      }

      event.preventDefault();

      switch (action.type) {
        case "focus-pane":
          focusAdjacentPane(action.direction);
          return;
        case "create-tab":
          createTab(tabDefaults);
          return;
        case "close-tab":
          if (windowModel && windowModel.tabOrder.length > 1) {
            closeTab(windowModel.activeTabId);
          }
          return;
        case "rename-active-tab":
          startRenameActiveTab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeTab, createTab, focusAdjacentPane, startRenameActiveTab, tabDefaults, windowModel]);
}
