import { describe, expect, it } from "vitest";

import { applyTerminalAppearance } from "./terminal-appearance";

describe("terminal appearance", () => {
  it("updates mutable font and theme options", () => {
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
      theme: {
        background: "#10141c",
        foreground: "#f3f5f7",
        cursor: "#f3f5f7",
        selectionBackground: "#456ca7",
        selectionForeground: "#f3f5f7",
        selectionInactiveBackground: "#324f7a",
        black: "#1b2330",
        brightBlack: "#4e5d78",
      },
    });

    expect(terminal.options).toBe(options);
    expect(terminal.options).toEqual({
      cols: 120,
      rows: 30,
      fontFamily: "JetBrains Mono",
      fontSize: 14,
      theme: {
        background: "#10141c",
        foreground: "#f3f5f7",
        cursor: "#f3f5f7",
        selectionBackground: "#456ca7",
        selectionForeground: "#f3f5f7",
        selectionInactiveBackground: "#324f7a",
        black: "#1b2330",
        brightBlack: "#4e5d78",
      },
    });
  });
});
