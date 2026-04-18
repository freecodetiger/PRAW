import { useEffect } from "react";

import type { TerminalShortcutConfig } from "../../../domain/config/terminal-shortcuts";
import { resolveWorkspaceShortcut } from "../../../domain/terminal/shortcuts";

interface UseWorkspaceShortcutsOptions {
  focusAdjacentTab: (direction: "left" | "right" | "up" | "down") => void;
  splitActiveTab: (axis: "horizontal" | "vertical") => void;
  requestEditNoteForActiveTab: () => void;
  toggleFocusPane: () => void;
  toggleAiVoiceBypass: () => void;
  shortcuts: TerminalShortcutConfig;
}

export function useWorkspaceShortcuts({
  focusAdjacentTab,
  splitActiveTab,
  requestEditNoteForActiveTab,
  toggleFocusPane,
  toggleAiVoiceBypass,
  shortcuts,
}: UseWorkspaceShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const action = resolveWorkspaceShortcut(event, shortcuts);
      if (!action) {
        return;
      }

      if (
        action.type === "focus-pane" &&
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      switch (action.type) {
        case "focus-pane":
          focusAdjacentTab(action.direction);
          return;
        case "split-right":
          splitActiveTab("horizontal");
          return;
        case "split-down":
          splitActiveTab("vertical");
          return;
        case "edit-note":
          requestEditNoteForActiveTab();
          return;
        case "toggle-focus-pane":
          toggleFocusPane();
          return;
        case "toggle-ai-voice-bypass":
          toggleAiVoiceBypass();
          return;
      }
    };

    const listenerOptions = { capture: true } as const;
    window.addEventListener("keydown", handleKeyDown, listenerOptions);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, listenerOptions);
    };
  }, [focusAdjacentTab, requestEditNoteForActiveTab, shortcuts, splitActiveTab, toggleAiVoiceBypass, toggleFocusPane]);
}
