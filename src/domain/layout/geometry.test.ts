import { describe, expect, it } from "vitest";

import {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  SPLIT_DIVIDER_SIZE_PX,
  canSplitPane,
  resizeContainerDivider,
  solveLayoutGeometry,
} from "./geometry";
import type { LayoutNode } from "./types";

const defaultMinimums = (paneId: string, placement: { touchesWindowBottom: boolean }) => ({
  minWidthPx: MIN_PANE_WIDTH_PX,
  minHeightPx:
    paneId === "tab:3" && placement.touchesWindowBottom ? MIN_BOUNDARY_PANE_HEIGHT_PX : MIN_INTERIOR_PANE_HEIGHT_PX,
});

describe("solveLayoutGeometry", () => {
  it("projects a flat multi-child container into pixel rects", () => {
    const layout: LayoutNode = {
      kind: "container",
      id: "container:root",
      axis: "horizontal",
      sizes: [1, 2, 1],
      children: [
        { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
        { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        { kind: "pane", id: "pane:tab:3", paneId: "tab:3" },
      ],
    };

    const solved = solveLayoutGeometry(layout, { widthPx: 406, heightPx: 240 }, defaultMinimums);

    expect(solved.paneRects).toEqual({
      "tab:1": { x: 0, y: 0, width: 98.5, height: 240 },
      "tab:2": { x: 104.5, y: 0, width: 197, height: 240 },
      "tab:3": { x: 307.5, y: 0, width: 98.5, height: 240 },
    });
  });
});

describe("resizeContainerDivider", () => {
  it("only redistributes space between the two panes adjacent to the divider", () => {
    const layout: LayoutNode = {
      kind: "container",
      id: "container:root",
      axis: "vertical",
      sizes: [160, 160, 160],
      children: [
        { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
        { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        { kind: "pane", id: "pane:tab:3", paneId: "tab:3" },
      ],
    };

    const resized = resizeContainerDivider(
      layout,
      { widthPx: 640, heightPx: 492 },
      { containerId: "container:root", dividerIndex: 0, deltaPx: 120 },
      defaultMinimums,
    );
    const solved = solveLayoutGeometry(resized, { widthPx: 640, heightPx: 492 }, defaultMinimums);

    expect(solved.paneRects["tab:1"].height).toBeCloseTo(248);
    expect(solved.paneRects["tab:2"].height).toBe(MIN_INTERIOR_PANE_HEIGHT_PX);
    expect(solved.paneRects["tab:3"].height).toBe(160);
  });

  it("treats the bottom-edge pane as a wall and keeps its full composer height", () => {
    const layout: LayoutNode = {
      kind: "container",
      id: "container:root",
      axis: "vertical",
      sizes: [160, 160, 160],
      children: [
        { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
        { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        { kind: "pane", id: "pane:tab:3", paneId: "tab:3" },
      ],
    };

    const resized = resizeContainerDivider(
      layout,
      { widthPx: 640, heightPx: 492 },
      { containerId: "container:root", dividerIndex: 1, deltaPx: 160 },
      defaultMinimums,
    );
    const solved = solveLayoutGeometry(resized, { widthPx: 640, heightPx: 492 }, defaultMinimums);

    expect(solved.paneRects["tab:2"].height).toBe(192);
    expect(solved.paneRects["tab:3"].height).toBe(MIN_BOUNDARY_PANE_HEIGHT_PX);
  });
});

describe("canSplitPane", () => {
  it("rejects vertical splits when the available height cannot fit an interior pane plus a bottom-edge wall", () => {
    const layout: LayoutNode = {
      kind: "pane",
      id: "pane:tab:3",
      paneId: "tab:3",
    };

    expect(
      canSplitPane(
        layout,
        { widthPx: 640, heightPx: MIN_INTERIOR_PANE_HEIGHT_PX + MIN_BOUNDARY_PANE_HEIGHT_PX + SPLIT_DIVIDER_SIZE_PX - 1 },
        "tab:3",
        "vertical",
        defaultMinimums,
      ),
    ).toBe(false);

    expect(
      canSplitPane(
        layout,
        { widthPx: 640, heightPx: MIN_INTERIOR_PANE_HEIGHT_PX + MIN_BOUNDARY_PANE_HEIGHT_PX + SPLIT_DIVIDER_SIZE_PX },
        "tab:3",
        "vertical",
        defaultMinimums,
      ),
    ).toBe(true);
  });
});
