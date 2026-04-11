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

  it("marks every non-terminal child in a horizontal container as flush-right", () => {
    expect(getChildBorderMask({}, "horizontal", 0, 3)).toEqual({
      right: true,
    });
    expect(getChildBorderMask({}, "horizontal", 2, 3)).toEqual({});
  });

  it("preserves the two-child compatibility helper", () => {
    expect(splitPaneBorderMask({}, "vertical")).toEqual({
      first: {
        bottom: true,
      },
      second: {},
    });
  });
});
