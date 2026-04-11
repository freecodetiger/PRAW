import type { FocusDirection } from "../layout/types";

export interface TerminalShortcutEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

export type WorkspaceShortcutAction =
  | { type: "focus-pane"; direction: FocusDirection }
  | { type: "create-tab" }
  | { type: "close-tab" }
  | { type: "rename-active-tab" };

export type TerminalShortcutAction = { type: "copy-selection" } | { type: "paste" };

export function resolveWorkspaceShortcut(event: TerminalShortcutEvent): WorkspaceShortcutAction | null {
  const key = normalizeKey(event.key);

  if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey) {
    switch (key) {
      case "arrowleft":
        return { type: "focus-pane", direction: "left" };
      case "arrowright":
        return { type: "focus-pane", direction: "right" };
      case "arrowup":
        return { type: "focus-pane", direction: "up" };
      case "arrowdown":
        return { type: "focus-pane", direction: "down" };
    }
  }

  if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    switch (key) {
      case "t":
        return { type: "create-tab" };
      case "w":
        return { type: "close-tab" };
    }
  }

  if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && key === "f2") {
    return { type: "rename-active-tab" };
  }

  return null;
}

export function resolveTerminalShortcut(event: TerminalShortcutEvent): TerminalShortcutAction | null {
  const key = normalizeKey(event.key);

  if (event.isComposing || key === "process" || key === "dead") {
    return null;
  }

  if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    if (key === "c") {
      return { type: "copy-selection" };
    }

    if (key === "v") {
      return { type: "paste" };
    }
  }

  if (!event.ctrlKey && !event.altKey && event.shiftKey && !event.metaKey && key === "insert") {
    return { type: "paste" };
  }

  return null;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}
