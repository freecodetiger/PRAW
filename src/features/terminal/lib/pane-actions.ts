export type PaneActionId = "split-right" | "split-down" | "edit-note" | "close-tab" | "restart-shell";

export interface PaneAction {
  id: PaneActionId;
  label: string;
  disabled: boolean;
}

interface ResolvePaneActionsInput {
  canClose: boolean;
  canSplitHorizontal: boolean;
  canSplitVertical: boolean;
}

export function resolvePaneActions({
  canClose,
  canSplitHorizontal,
  canSplitVertical,
}: ResolvePaneActionsInput): PaneAction[] {
  return [
    {
      id: "split-right",
      label: "Split Right",
      disabled: !canSplitHorizontal,
    },
    {
      id: "split-down",
      label: "Split Down",
      disabled: !canSplitVertical,
    },
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
