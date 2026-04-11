import { describe, expect, it } from "vitest";

import { getDividerOverlapStyle, splitPaneBorderMask } from "./layout-presentation";

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

  it("hides the shared border between left and right panes", () => {
    expect(splitPaneBorderMask({}, "horizontal")).toEqual({
      first: {
        right: true,
      },
      second: {},
    });
  });

  it("hides the shared border between top and bottom panes", () => {
    expect(splitPaneBorderMask({}, "vertical")).toEqual({
      first: {
        bottom: true,
      },
      second: {},
    });
  });
});
