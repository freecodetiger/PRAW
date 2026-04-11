import { describe, expect, it } from "vitest";

import {
  applyPaneDragPreview,
  collectLeafPaneIds,
  createLeafLayout,
  createPaneDragPreview,
  findAdjacentPaneId,
  setSplitRatio,
  toPaneRects,
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
    id: "leaf:left",
    paneId: "pane:left",
  },
  second: {
    kind: "split",
    id: "split:right",
    axis: "vertical",
    ratio: 0.5,
    first: {
      kind: "leaf",
      id: "leaf:top-right",
      paneId: "pane:top-right",
    },
    second: {
      kind: "leaf",
      id: "leaf:bottom-right",
      paneId: "pane:bottom-right",
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

describe("findAdjacentPaneId", () => {
  it.each<[string, FocusDirection, string | null]>([
    ["pane:left", "right", "pane:top-right"],
    ["pane:top-right", "left", "pane:left"],
    ["pane:top-right", "down", "pane:bottom-right"],
    ["pane:bottom-right", "up", "pane:top-right"],
    ["pane:left", "up", null],
  ])("finds the next pane from %s toward %s", (paneId, direction, expected) => {
    expect(findAdjacentPaneId(sampleLayout, paneId, direction)).toBe(expected);
  });
});

describe("toPaneRects", () => {
  it("projects leaves into normalized rectangles for spatial reasoning", () => {
    expect(toPaneRects(createLeafLayout("pane:main"))).toEqual({
      "pane:main": {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });
  });
});

describe("createPaneDragPreview", () => {
  it("maps a hovered edge into split axis and order", () => {
    expect(
      createPaneDragPreview(sampleLayout, "pane:left", "pane:top-right", "bottom"),
    ).toEqual({
      sourcePaneId: "pane:left",
      targetPaneId: "pane:top-right",
      axis: "vertical",
      order: "after",
    });
  });
});

describe("applyPaneDragPreview", () => {
  it("moves the source pane next to the target pane using the preview geometry", () => {
    const moved = applyPaneDragPreview(sampleLayout, {
      sourcePaneId: "pane:left",
      targetPaneId: "pane:bottom-right",
      axis: "vertical",
      order: "before",
    });

    expect(collectLeafPaneIds(moved)).toEqual(["pane:top-right", "pane:left", "pane:bottom-right"]);
    expect(findAdjacentPaneId(moved, "pane:left", "down")).toBe("pane:bottom-right");
    expect(findAdjacentPaneId(moved, "pane:left", "up")).toBe("pane:top-right");
  });
});
