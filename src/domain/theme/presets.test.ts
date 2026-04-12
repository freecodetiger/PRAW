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

  it("returns a dark preset with dark app and terminal colors", () => {
    expect(getThemePreset("dark")).toMatchObject({
      id: "dark",
      colorScheme: "dark",
      app: {
        background: "#0f1115",
        surface: "#151922",
        textPrimary: "#f5f7fb",
      },
      terminal: {
        background: "#10141c",
        foreground: "#f3f5f7",
        cursor: "#f3f5f7",
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
