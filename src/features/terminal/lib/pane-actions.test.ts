import { describe, expect, it } from "vitest";

import { resolvePaneActions } from "./pane-actions";

describe("pane actions", () => {
  it("returns the header menu actions in stable order", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        canEnterAiMode: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("disables only the actions blocked by pane constraints", () => {
    expect(
      resolvePaneActions({
        canClose: false,
        isFocusModeActive: false,
        canEnterAiMode: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("keeps the menu free of focus actions and still disables close while focused", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        canEnterAiMode: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);

    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: true,
        canEnterAiMode: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("adds a manual AI mode entry only when the pane can switch the current command into agent workflow", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        canEnterAiMode: true,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "enter-ai-mode", label: "Switch to AI Mode", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);

    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        canEnterAiMode: false,
      }).some((action) => action.id === "enter-ai-mode"),
    ).toBe(false);
  });
});
