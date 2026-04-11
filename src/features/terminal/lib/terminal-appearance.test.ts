import { describe, expect, it } from "vitest";

import { applyTerminalAppearance } from "./terminal-appearance";

describe("terminal appearance", () => {
  it("updates only mutable font options", () => {
    const options = {
      cols: 120,
      rows: 30,
      fontFamily: "Old Font",
      fontSize: 12,
    };
    const terminal = {
      options,
    };

    applyTerminalAppearance(terminal, {
      fontFamily: "JetBrains Mono",
      fontSize: 14,
    });

    expect(terminal.options).toBe(options);
    expect(terminal.options).toEqual({
      cols: 120,
      rows: 30,
      fontFamily: "JetBrains Mono",
      fontSize: 14,
    });
  });
});
