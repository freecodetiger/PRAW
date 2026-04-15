import { describe, expect, it } from "vitest";

import { getThemePreset } from "./presets";

describe("theme presets", () => {
  it("returns the light preset by default", () => {
    expect(getThemePreset("light")).toMatchObject({
      id: "light",
      colorScheme: "light",
      app: {
        background: "#f5f1e8",
        surface: "#fdfaf4",
        textPrimary: "#241f17",
        historyCommand: "#5c7198",
      },
      terminal: {
        background: "#fbf8f2",
        foreground: "#241f17",
        blue: "#6e83ac",
      },
    });
  });

  it("returns a dark preset with restrained graphite contrast instead of pure black", () => {
    expect(getThemePreset("dark")).toMatchObject({
      id: "dark",
      colorScheme: "dark",
      app: {
        background: "#0d1117",
        surface: "#121821",
        textPrimary: "#edf2f7",
        historyCommand: "#93adf5",
        historyAccent: "#aebcff",
      },
      terminal: {
        background: "#111723",
        foreground: "#e6edf5",
        cursor: "#e6edf5",
        blue: "#7ea2ff",
        brightBlue: "#a9c1ff",
      },
    });
  });

  it("returns a sepia preset with warm app and terminal colors", () => {
    expect(getThemePreset("sepia")).toMatchObject({
      id: "sepia",
      colorScheme: "light",
      app: {
        background: "#f3eadc",
        surface: "#fcf7ef",
        textPrimary: "#312519",
      },
      terminal: {
        background: "#f8f1e7",
        foreground: "#2f2419",
        cursor: "#2f2419",
      },
    });
  });
});
