import type { FocusDirection } from "../layout/types";
import type { TerminalShortcutConfig } from "../config/terminal-shortcuts";

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
  | { type: "split-right" }
  | { type: "split-down" }
  | { type: "edit-note" }
  | { type: "toggle-focus-pane" };

export type TerminalShortcutAction = { type: "copy-selection" } | { type: "paste" };

export function resolveWorkspaceShortcut(
  event: TerminalShortcutEvent,
  shortcuts: TerminalShortcutConfig,
): WorkspaceShortcutAction | null {
  const paneAction = resolvePaneActionShortcut(event, shortcuts);
  if (paneAction) {
    return paneAction;
  }

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

  if (!event.ctrlKey && !event.altKey && !event.shiftKey && event.metaKey) {
    if (key === "c") {
      return { type: "copy-selection" };
    }

    if (key === "v") {
      return { type: "paste" };
    }
  }

  return null;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function resolvePaneActionShortcut(
  event: TerminalShortcutEvent,
  shortcuts: TerminalShortcutConfig,
): WorkspaceShortcutAction | null {
  if (matchesShortcutBinding(event, shortcuts.splitRight)) {
    return { type: "split-right" };
  }

  if (matchesShortcutBinding(event, shortcuts.splitDown)) {
    return { type: "split-down" };
  }

  if (matchesShortcutBinding(event, shortcuts.editNote)) {
    return { type: "edit-note" };
  }

  if (matchesShortcutBinding(event, shortcuts.toggleFocusPane)) {
    return { type: "toggle-focus-pane" };
  }

  return null;
}

function matchesShortcutBinding(
  event: TerminalShortcutEvent,
  binding: TerminalShortcutConfig[keyof TerminalShortcutConfig],
): boolean {
  if (!binding) {
    return false;
  }

  return (
    normalizeKey(event.key) === normalizeKey(binding.key) &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  );
}
