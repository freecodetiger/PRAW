export type PaneActionId = "edit-note" | "enter-ai-mode" | "close-tab" | "restart-shell";

export interface PaneAction {
  id: PaneActionId;
  label: string;
  disabled: boolean;
}

interface ResolvePaneActionsInput {
  canClose: boolean;
  isFocusModeActive: boolean;
  canEnterAiMode: boolean;
}

export function resolvePaneActions({
  canClose,
  isFocusModeActive,
  canEnterAiMode,
}: ResolvePaneActionsInput): PaneAction[] {
  return [
    {
      id: "edit-note",
      label: "Edit Note",
      disabled: false,
    },
    ...(canEnterAiMode
      ? ([
          {
            id: "enter-ai-mode",
            label: "Switch to AI Mode",
            disabled: false,
          },
        ] satisfies PaneAction[])
      : []),
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
