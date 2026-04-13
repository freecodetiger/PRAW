import { describe, expect, it } from "vitest";

import { resolvePaneActions } from "./pane-actions";

describe("pane actions", () => {
  it("returns the header menu actions in stable order", () => {
    expect(
      resolvePaneActions({
        canClose: true,
        canSplitHorizontal: true,
        canSplitVertical: true,
      }),
    ).toEqual([
      { id: "split-right", label: "Split Right", disabled: false },
      { id: "split-down", label: "Split Down", disabled: false },
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: false },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });

  it("disables only the actions blocked by pane constraints", () => {
    expect(
      resolvePaneActions({
        canClose: false,
        canSplitHorizontal: false,
        canSplitVertical: true,
      }),
    ).toEqual([
      { id: "split-right", label: "Split Right", disabled: true },
      { id: "split-down", label: "Split Down", disabled: false },
      { id: "edit-note", label: "Edit Note", disabled: false },
      { id: "close-tab", label: "Close Tab", disabled: true },
      { id: "restart-shell", label: "Restart Shell", disabled: false },
    ]);
  });
});
