import { describe, expect, it } from "vitest";

import { getTerminalReplayPlan } from "./output-replay";

describe("output replay", () => {
  it("hydrates buffered content when terminal is empty", () => {
    expect(getTerminalReplayPlan("", "prompt$ ")).toEqual({
      type: "hydrate",
      content: "prompt$ ",
    });
  });

  it("does not replay appended output that should arrive via live stream", () => {
    expect(getTerminalReplayPlan("prompt$ ", "prompt$ ls")).toEqual({
      type: "noop",
    });
  });

  it("rehydrates when buffered output diverges from rendered content", () => {
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
