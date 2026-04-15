export type PaneActionId = "edit-note" | "focus-pane" | "close-tab" | "restart-shell";

export interface PaneAction {
  id: PaneActionId;
  label: string;
  disabled: boolean;
}

interface ResolvePaneActionsInput {
  canClose: boolean;
  isFocusModeActive: boolean;
  isFocusedPane: boolean;
}

export function resolvePaneActions({
  canClose,
  isFocusModeActive,
  isFocusedPane,
}: ResolvePaneActionsInput): PaneAction[] {
  return [
    {
      id: "edit-note",
      label: "Edit Note",
      disabled: false,
    },
    {
      id: "focus-pane",
      label: isFocusedPane ? "Exit Focus" : "Focus Pane",
      disabled: false,
    },
    {
      id: "close-tab",
      label: "Close Tab",
      disabled: !canClose || isFocusModeActive,
    },
    {
      id: "restart-shell",
      label: "Restart Shell",
      disabled: false,
    },
  ];
}
