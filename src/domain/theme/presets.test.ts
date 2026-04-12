import { describe, expect, it } from "vitest";

import { getThemePreset } from "./presets";

describe("theme presets", () => {
  it("returns the light preset by default", () => {
    expect(getThemePreset("light")).toMatchObject({
      id: "light",
      colorScheme: "light",
      app: {
        background: "#ffffff",
        surface: "#ffffff",
        textPrimary: "#000000",
      },
      terminal: {
        background: "#ffffff",
        foreground: "#000000",
      },
    });
  });

  it("returns a dark preset with traditional near-black terminal contrast", () => {
    expect(getThemePreset("dark")).toMatchObject({
      id: "dark",
      colorScheme: "dark",
      app: {
        background: "#000000",
        surface: "#050505",
        textPrimary: "#f7f7f7",
        historyCommand: "#8ab4ff",
        historyAccent: "#e0b7ff",
      },
      terminal: {
        background: "#000000",
        foreground: "#f5f5f5",
        cursor: "#f5f5f5",
        blue: "#61afef",
        brightBlue: "#8fc7ff",
      },
    });
  });

  it("returns a sepia preset with warm app and terminal colors", () => {
    expect(getThemePreset("sepia")).toMatchObject({
      id: "sepia",
      colorScheme: "light",
      app: {
        background: "#f4ead7",
        surface: "#fbf3e4",
        textPrimary: "#2f2419",
      },
      terminal: {
        background: "#f7efe2",
        foreground: "#2f2419",
        cursor: "#2f2419",
      },
    });
  });
});
