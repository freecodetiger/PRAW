import { describe, expect, it } from "vitest";

import { EMPTY_TERMINAL_BUFFER, appendTerminalBuffer, resetTerminalBuffer } from "./buffer";

describe("terminal buffer", () => {
  it("appends output and bumps the revision", () => {
    const first = appendTerminalBuffer(EMPTY_TERMINAL_BUFFER, "hello");
    const second = appendTerminalBuffer(first, "\nworld");

    expect(first).toEqual({
      content: "hello",
      revision: 1,
    });
    expect(second).toEqual({
      content: "hello\nworld",
      revision: 2,
    });
  });

  it("keeps only the most recent output within the configured limit", () => {
    const snapshot = appendTerminalBuffer(EMPTY_TERMINAL_BUFFER, "abcdef", 4);

    expect(snapshot).toEqual({
      content: "cdef",
      revision: 1,
    });
  });

  it("clears buffered output while tracking a new revision", () => {
    const snapshot = appendTerminalBuffer(EMPTY_TERMINAL_BUFFER, "data");

    expect(resetTerminalBuffer(snapshot)).toEqual({
      content: "",
      revision: 2,
    });
  });
});
