import { describe, expect, it } from "vitest";

import { resolvePaneActions } from "./pane-actions";

describe("pane actions", () => {
  it("returns the header menu actions in stable order", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        isFocusModeActive: false,
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
      }),
    ).toEqual([
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });
});
