export type PaneActionId = "edit-note" | "close-tab" | "restart-shell";

export interface PaneAction {
  id: PaneActionId;
  label: string;
  disabled: boolean;
}

interface ResolvePaneActionsInput {
  canClose: boolean;
}

export function resolvePaneActions({
  canClose,
}: ResolvePaneActionsInput): PaneAction[] {
  return [
    {
      id: "edit-note",
      label: "Edit Note",
      disabled: false,
    },
    {
      id: "close-tab",
      label: "Close Tab",
      disabled: !canClose,
    },
    {
      id: "restart-shell",
      label: "Restart Shell",
      disabled: false,
    },
  ];
}
