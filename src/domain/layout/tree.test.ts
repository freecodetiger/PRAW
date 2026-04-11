import { describe, expect, it } from "vitest";

import {
  applyLeafDragPreview,
  collectLeafIds,
  createLeafLayout,
  createLeafDragPreview,
  findAdjacentLeafId,
  setSplitRatio,
  toLeafRects,
  type FocusDirection,
} from "./tree";
import type { LayoutNode } from "./types";

const sampleLayout: LayoutNode = {
  kind: "split",
  id: "split:root",
  axis: "horizontal",
  ratio: 0.5,
  first: {
    kind: "leaf",
    id: "leaf:tab:1",
    leafId: "tab:1",
  },
  second: {
    kind: "split",
    id: "split:right",
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

describe("setSplitRatio", () => {
  it("updates only the targeted split and clamps the ratio", () => {
    expect(setSplitRatio(sampleLayout, "split:right", 0.95)).toEqual({
      ...sampleLayout,
      second: {
        ...sampleLayout.second,
        ratio: 0.85,
      },
    });
  });
});

describe("findAdjacentLeafId", () => {
  it.each<[string, FocusDirection, string | null]>([
    ["tab:1", "right", "tab:2"],
    ["tab:2", "left", "tab:1"],
    ["tab:2", "down", "tab:3"],
    ["tab:3", "up", "tab:2"],
    ["tab:1", "up", null],
  ])("finds the next tab from %s toward %s", (leafId, direction, expected) => {
    expect(findAdjacentLeafId(sampleLayout, leafId, direction)).toBe(expected);
  });
});

describe("toLeafRects", () => {
  it("projects leaves into normalized rectangles for spatial reasoning", () => {
    expect(toLeafRects(createLeafLayout("tab:1"))).toEqual({
      "tab:1": {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });
  });
});

describe("createLeafDragPreview", () => {
  it("maps a hovered edge into split axis and order", () => {
    expect(
      createLeafDragPreview(sampleLayout, "tab:1", "tab:2", "bottom"),
    ).toEqual({
      sourceLeafId: "tab:1",
      targetLeafId: "tab:2",
      axis: "vertical",
      order: "after",
    });
  });
});

describe("applyLeafDragPreview", () => {
  it("moves the source tab next to the target tab using the preview geometry", () => {
    const moved = applyLeafDragPreview(sampleLayout, {
      sourceLeafId: "tab:1",
      targetLeafId: "tab:3",
      axis: "vertical",
      order: "before",
    });

    expect(collectLeafIds(moved)).toEqual(["tab:2", "tab:1", "tab:3"]);
    expect(findAdjacentLeafId(moved, "tab:1", "down")).toBe("tab:3");
    expect(findAdjacentLeafId(moved, "tab:1", "up")).toBe("tab:2");
  });
});
