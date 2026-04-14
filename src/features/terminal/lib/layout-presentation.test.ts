import { describe, expect, it } from "vitest";

import { getChildBorderMask, getDividerOverlapStyle, splitPaneBorderMask } from "./layout-presentation";

describe("layout presentation", () => {
  it("overlaps horizontal dividers on the x axis", () => {
    expect(getDividerOverlapStyle("horizontal")).toEqual({
      margin: "0 -3px",
    });
  });

  it("overlaps vertical dividers on the y axis", () => {
    expect(getDividerOverlapStyle("vertical")).toEqual({
      margin: "-3px 0",
    });
  });

  it("marks both panes touching a horizontal seam as flush on their shared edge", () => {
    expect(getChildBorderMask({}, "horizontal", 0, 3)).toEqual({
      right: true,
    });
    expect(getChildBorderMask({}, "horizontal", 1, 3)).toEqual({
      left: true,
      right: true,
    });
    expect(getChildBorderMask({}, "horizontal", 2, 3)).toEqual({
      left: true,
    });
  });

  it("marks both panes touching a vertical seam as flush on their shared edge", () => {
    expect(getChildBorderMask({}, "vertical", 0, 3)).toEqual({
      bottom: true,
    });
    expect(getChildBorderMask({}, "vertical", 1, 3)).toEqual({
      top: true,
      bottom: true,
    });
    expect(getChildBorderMask({}, "vertical", 2, 3)).toEqual({
      top: true,
    });
  });

  it("preserves the two-child compatibility helper while rounding both sides of the split", () => {
    expect(splitPaneBorderMask({}, "vertical")).toEqual({
      first: {
        bottom: true,
      },
      second: {
        top: true,
      },
    });
  });
});
