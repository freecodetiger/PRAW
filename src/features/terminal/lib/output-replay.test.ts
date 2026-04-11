import { describe, expect, it } from "vitest";

import { getTerminalReplayPlan } from "./output-replay";

describe("output replay", () => {
  it("hydrates buffered content when terminal is empty", () => {
    expect(getTerminalReplayPlan("", "prompt$ ")).toEqual({
      type: "hydrate",
      content: "prompt$ ",
    });
  });

  it("appends only the buffered delta when output grows", () => {
    expect(getTerminalReplayPlan("prompt$ ", "prompt$ ls")).toEqual({
      type: "append",
      content: "ls",
    });
  });

  it("rehydrates when buffered output diverges from the previously applied buffer", () => {
    expect(getTerminalReplayPlan("prompt$ stale", "prompt$ fresh")).toEqual({
      type: "hydrate",
      content: "prompt$ fresh",
    });
  });

  it("clears the terminal when the buffered content resets", () => {
    expect(getTerminalReplayPlan("prompt$ old", "")).toEqual({
      type: "hydrate",
      content: "",
    });
  });
});
