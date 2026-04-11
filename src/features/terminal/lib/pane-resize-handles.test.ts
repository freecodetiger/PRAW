import { describe, expect, it } from "vitest";

import type { LayoutNode } from "../../../domain/layout/types";
import {
  PANE_RESIZE_HANDLE_OVERLAP_PX,
  PANE_RESIZE_HANDLE_THICKNESS_PX,
  getPaneResizeHandleStyle,
  getPaneResizeHandles,
} from "./pane-resize-handles";

const sampleLayout: LayoutNode = {
  kind: "container",
  id: "container:root",
  axis: "horizontal",
  sizes: [1, 1],
  children: [
    {
      kind: "pane",
      id: "pane:tab:1",
      paneId: "tab:1",
    },
    {
      kind: "container",
      id: "container:right",
      axis: "vertical",
      sizes: [1, 1],
      children: [
        {
          kind: "pane",
          id: "pane:tab:2",
          paneId: "tab:2",
        },
        {
          kind: "pane",
          id: "pane:tab:3",
          paneId: "tab:3",
        },
      ],
    },
  ],
};

describe("getPaneResizeHandles", () => {
  it("returns only the edges that have a real adjacent divider", () => {
    expect(getPaneResizeHandles(sampleLayout, "tab:2").map((entry) => entry.edge)).toEqual(["left", "bottom"]);
    expect(getPaneResizeHandles(sampleLayout, "tab:3").map((entry) => entry.edge)).toEqual(["left", "top"]);
    expect(getPaneResizeHandles(sampleLayout, "tab:1").map((entry) => entry.edge)).toEqual(["right"]);
  });
});

describe("getPaneResizeHandleStyle", () => {
  it("extends horizontal handles beyond the pane edge so the shared seam stays draggable", () => {
    expect(getPaneResizeHandleStyle("left")).toMatchObject({
      top: 0,
      bottom: 0,
      left: -PANE_RESIZE_HANDLE_OVERLAP_PX,
      width: PANE_RESIZE_HANDLE_THICKNESS_PX,
    });

    expect(getPaneResizeHandleStyle("right")).toMatchObject({
      top: 0,
      bottom: 0,
      right: -PANE_RESIZE_HANDLE_OVERLAP_PX,
      width: PANE_RESIZE_HANDLE_THICKNESS_PX,
    });
  });

  it("extends vertical handles beyond the pane edge so the shared seam stays draggable", () => {
    expect(getPaneResizeHandleStyle("top")).toMatchObject({
      left: 0,
      right: 0,
      top: -PANE_RESIZE_HANDLE_OVERLAP_PX,
      height: PANE_RESIZE_HANDLE_THICKNESS_PX,
    });

    expect(getPaneResizeHandleStyle("bottom")).toMatchObject({
      left: 0,
      right: 0,
      bottom: -PANE_RESIZE_HANDLE_OVERLAP_PX,
      height: PANE_RESIZE_HANDLE_THICKNESS_PX,
    });
  });
});
