import { describe, expect, it } from "vitest";

import { formatTabLabel } from "./label";

describe("formatTabLabel", () => {
  it("returns the stable title when note is missing", () => {
    expect(formatTabLabel("Tab 1")).toBe("Tab 1");
  });

  it("appends the note with a middle dot separator", () => {
    expect(formatTabLabel("Tab 1", "Build")).toBe("Tab 1 · Build");
  });
});
