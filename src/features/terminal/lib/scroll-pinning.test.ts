import { describe, expect, it } from "vitest";

import { resolvePinnedBottomState } from "./scroll-pinning";

describe("resolvePinnedBottomState", () => {
  it("keeps the view pinned when a manual jump has just been requested", () => {
    expect(resolvePinnedBottomState(240, true)).toBe(true);
  });

  it("uses distance threshold for normal scroll updates", () => {
    expect(resolvePinnedBottomState(8, false)).toBe(true);
    expect(resolvePinnedBottomState(24, false)).toBe(true);
    expect(resolvePinnedBottomState(48, false)).toBe(true);
    expect(resolvePinnedBottomState(72, false)).toBe(false);
  });
});
