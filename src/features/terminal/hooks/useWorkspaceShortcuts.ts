import { useEffect } from "react";

import { resolveWorkspaceShortcut } from "../../../domain/terminal/shortcuts";

interface UseWorkspaceShortcutsOptions {
  focusAdjacentTab: (direction: "left" | "right" | "up" | "down") => void;
}

export function useWorkspaceShortcuts({ focusAdjacentTab }: UseWorkspaceShortcutsOptions) {
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
          focusAdjacentTab(action.direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusAdjacentTab]);
}
