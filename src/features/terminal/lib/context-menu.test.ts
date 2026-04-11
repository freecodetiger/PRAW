import { describe, expect, it } from "vitest";

import { shouldCloseContextMenu } from "./context-menu";

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
