import { describe, expect, it } from "vitest";

import { calculateContextMenuPosition, shouldCloseContextMenu } from "./context-menu";

describe("shouldCloseContextMenu", () => {
  it("keeps the menu open when the pointer event starts inside the menu", () => {
    const target = { id: "menu-item" };
    const menu = {
      contains(candidate: unknown) {
        return candidate === target;
      },
    };

    expect(shouldCloseContextMenu(menu, target)).toBe(false);
  });

  it("closes the menu when the pointer event starts outside the menu", () => {
    const menu = {
      contains() {
        return false;
      },
    };

    expect(shouldCloseContextMenu(menu, { id: "outside" })).toBe(true);
  });
});

describe("calculateContextMenuPosition", () => {
  it("keeps the menu near the click point when enough space is available", () => {
    expect(
      calculateContextMenuPosition({
        clickX: 120,
        clickY: 80,
        menuWidth: 160,
        menuHeight: 200,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 120, top: 80 });
  });

  it("shifts the menu to the left and upward when the bottom-right corner would overflow", () => {
    expect(
      calculateContextMenuPosition({
        clickX: 790,
        clickY: 590,
        menuWidth: 160,
        menuHeight: 200,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 632, top: 392 });
  });
});
