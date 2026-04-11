import { describe, expect, it } from "vitest";

import {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  canSplitPaneAtSize,
  constrainSplitRatio,
  getMinimumSubtreeSpanPx,
} from "./constraints";
import type { SplitNode } from "./types";

const nestedVerticalLayout: SplitNode = {
  kind: "split",
  id: "split:root",
  axis: "vertical",
  ratio: 0.5,
  first: {
    kind: "leaf",
    id: "leaf:tab:1",
    leafId: "tab:1",
  },
  second: {
    kind: "split",
    id: "split:bottom",
    axis: "vertical",
    ratio: 0.5,
    first: {
      kind: "leaf",
      id: "leaf:tab:2",
      leafId: "tab:2",
    },
    second: {
      kind: "leaf",
      id: "leaf:tab:3",
      leafId: "tab:3",
    },
  },
};

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

describe("getMinimumSubtreeSpanPx", () => {
  it("keeps only the trailing bottom leaf as a full-height wall", () => {
    expect(getMinimumSubtreeSpanPx(nestedVerticalLayout.second, "vertical", { preserveTrailingBoundary: true })).toBe(
      MIN_INTERIOR_PANE_HEIGHT_PX + 6 + MIN_BOUNDARY_PANE_HEIGHT_PX,
    );
  });
});

describe("constrainSplitRatio", () => {
  it("lets upper tabs keep shrinking until the bottom-edge tab stack reaches its floor", () => {
    expect(constrainSplitRatio(nestedVerticalLayout, 600, 0.8, { preserveTrailingBoundary: true })).toBeCloseTo(
      0.6531986532,
    );
  });
});
