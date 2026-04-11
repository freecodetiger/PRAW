import { describe, expect, it } from "vitest";

import {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  canSplitPaneAtSize,
} from "./constraints";

describe("canSplitPaneAtSize", () => {
  it("allows tighter vertical splits away from the bottom window edge", () => {
    expect(canSplitPaneAtSize("vertical", 149)).toBe(false);
    expect(canSplitPaneAtSize("vertical", 150)).toBe(true);
  });

  it("requires a full bottom-edge dialog when the pane touches the window floor", () => {
    expect(
      canSplitPaneAtSize("vertical", MIN_INTERIOR_PANE_HEIGHT_PX + MIN_BOUNDARY_PANE_HEIGHT_PX + 5, {
        preserveTrailingBoundary: true,
      }),
    ).toBe(false);
    expect(
      canSplitPaneAtSize("vertical", MIN_INTERIOR_PANE_HEIGHT_PX + MIN_BOUNDARY_PANE_HEIGHT_PX + 6, {
        preserveTrailingBoundary: true,
      }),
    ).toBe(true);
  });

  it("rejects horizontal splits once the pane is too narrow for two minimum-width tabs", () => {
    expect(canSplitPaneAtSize("horizontal", 445)).toBe(false);
    expect(canSplitPaneAtSize("horizontal", 446)).toBe(true);
  });
});
