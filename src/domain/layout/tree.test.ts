import { describe, expect, it } from "vitest";

import {
  applyLeafDragPreview,
  collectLeafIds,
  createLeafDragPreview,
  createLeafLayout,
  findAdjacentLeafId,
  removeLeaf,
  splitLeaf,
  type FocusDirection,
} from "./tree";
import type { LayoutNode } from "./types";

describe("splitLeaf", () => {
  it("flattens same-axis splits into a single multi-child container", () => {
    const once = splitLeaf(createLeafLayout("tab:1"), "tab:1", "tab:2", "horizontal");
    const twice = splitLeaf(once, "tab:2", "tab:3", "horizontal");

    expect(collectLeafIds(twice)).toEqual(["tab:1", "tab:2", "tab:3"]);
    expect(twice).toMatchObject({
      kind: "container",
      axis: "horizontal",
      children: [
        { kind: "pane", paneId: "tab:1" },
        { kind: "pane", paneId: "tab:2" },
        { kind: "pane", paneId: "tab:3" },
      ],
    });

    if (twice.kind !== "container") {
      throw new Error("expected a container layout");
    }

    expect(twice.sizes).toHaveLength(3);
    expect(twice.sizes[1]).toBeCloseTo(twice.sizes[2]);
  });

  it("wraps only the target pane when the split axis differs from the parent axis", () => {
    const horizontal = splitLeaf(createLeafLayout("tab:1"), "tab:1", "tab:2", "horizontal");
    const nested = splitLeaf(horizontal, "tab:2", "tab:3", "vertical");

    expect(collectLeafIds(nested)).toEqual(["tab:1", "tab:2", "tab:3"]);
    expect(nested).toMatchObject({
      kind: "container",
      axis: "horizontal",
      children: [
        { kind: "pane", paneId: "tab:1" },
        {
          kind: "container",
          axis: "vertical",
          sizes: [1, 1],
          children: [
            { kind: "pane", paneId: "tab:2" },
            { kind: "pane", paneId: "tab:3" },
          ],
        },
      ],
    });
  });
});

describe("removeLeaf", () => {
  it("collapses containers that end up with a single surviving child", () => {
    const nested: LayoutNode = {
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

    expect(removeLeaf(nested, "tab:3")).toMatchObject({
      kind: "container",
      axis: "horizontal",
      children: [
        { kind: "pane", paneId: "tab:1" },
        { kind: "pane", paneId: "tab:2" },
      ],
    });
  });
});

describe("findAdjacentLeafId", () => {
  const sampleLayout: LayoutNode = {
    kind: "container",
    id: "container:root",
    axis: "horizontal",
    sizes: [2, 1, 1],
    children: [
      {
        kind: "pane",
        id: "pane:tab:1",
        paneId: "tab:1",
      },
      {
        kind: "container",
        id: "container:middle",
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
      {
        kind: "pane",
        id: "pane:tab:4",
        paneId: "tab:4",
      },
    ],
  };

  it.each<[string, FocusDirection, string | null]>([
    ["tab:1", "right", "tab:2"],
    ["tab:2", "down", "tab:3"],
    ["tab:3", "up", "tab:2"],
    ["tab:2", "left", "tab:1"],
    ["tab:2", "right", "tab:4"],
    ["tab:4", "right", null],
  ])("finds the next pane from %s toward %s", (paneId, direction, expected) => {
    expect(findAdjacentLeafId(sampleLayout, paneId, direction)).toBe(expected);
  });
});

describe("drag previews", () => {
  it("reorders panes next to the target and preserves a flat same-axis container", () => {
    const layout: LayoutNode = {
      kind: "container",
      id: "container:root",
      axis: "horizontal",
      sizes: [1, 1, 1],
      children: [
        { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
        { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        { kind: "pane", id: "pane:tab:3", paneId: "tab:3" },
      ],
    };

    expect(createLeafDragPreview(layout, "tab:3", "tab:1", "left")).toEqual({
      sourceLeafId: "tab:3",
      targetLeafId: "tab:1",
      axis: "horizontal",
      order: "before",
    });

    const moved = applyLeafDragPreview(layout, {
      sourceLeafId: "tab:3",
      targetLeafId: "tab:1",
      axis: "horizontal",
      order: "before",
    });

    expect(collectLeafIds(moved)).toEqual(["tab:3", "tab:1", "tab:2"]);
    expect(moved).toMatchObject({
      kind: "container",
      axis: "horizontal",
      children: [
        { kind: "pane", paneId: "tab:3" },
        { kind: "pane", paneId: "tab:1" },
        { kind: "pane", paneId: "tab:2" },
      ],
    });
  });
});
