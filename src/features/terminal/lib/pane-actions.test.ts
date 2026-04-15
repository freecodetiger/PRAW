import { describe, expect, it } from "vitest";

import { resolvePaneActions } from "./pane-actions";

describe("pane actions", () => {
  it("returns the header menu actions in stable order", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        isFocusedPane: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "focus-pane", label: "Focus Pane", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("disables only the actions blocked by pane constraints", () => {
    expect(
      resolvePaneActions({
        canClose: false,
        isFocusModeActive: false,
        isFocusedPane: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "focus-pane", label: "Focus Pane", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("adds a focus action that flips to exit focus when the pane is focused", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
        isFocusedPane: false,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "focus-pane", label: "Focus Pane", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);

    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: true,
        isFocusedPane: true,
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "focus-pane", label: "Exit Focus", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });
});
