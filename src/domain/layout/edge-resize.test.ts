import { describe, expect, it } from "vitest";

import { findPaneResizeTarget } from "./edge-resize";
import type { LayoutNode } from "./types";

const sampleLayout: LayoutNode = {
  kind: "container",
  id: "container:root",
  axis: "horizontal",
  sizes: [2, 1],
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

describe("findPaneResizeTarget", () => {
  it("maps a right edge to the nearest horizontal divider", () => {
    expect(findPaneResizeTarget(sampleLayout, "tab:1", "right")).toEqual({
      containerId: "container:root",
      dividerIndex: 0,
      axis: "horizontal",
      edge: "right",
    });
  });

  it("maps a left edge inside a nested subtree back to the ancestor horizontal divider", () => {
    expect(findPaneResizeTarget(sampleLayout, "tab:2", "left")).toEqual({
      containerId: "container:root",
      dividerIndex: 0,
      axis: "horizontal",
      edge: "left",
    });
  });

  it("maps a bottom edge to the nearest vertical divider", () => {
    expect(findPaneResizeTarget(sampleLayout, "tab:2", "bottom")).toEqual({
      containerId: "container:right",
      dividerIndex: 0,
      axis: "vertical",
      edge: "bottom",
    });
  });

  it("returns null for edges on the window boundary", () => {
    expect(findPaneResizeTarget(sampleLayout, "tab:1", "left")).toBeNull();
    expect(findPaneResizeTarget(sampleLayout, "tab:3", "bottom")).toBeNull();
  });
});
