export type ThemePresetId = "light" | "dark" | "sepia";

export interface ThemeAppPalette {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textMuted: string;
  border: string;
  borderMuted: string;
  overlayBackdrop: string;
  historyCommand: string;
  historyAccent: string;
  historyString: string;
  historyPath: string;
  historyUrl: string;
  historyError: string;
  historyWarning: string;
  historySuccess: string;
  historyNumber: string;
}

export interface ThemeTerminalPalette {
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  colorScheme: "light" | "dark";
  app: ThemeAppPalette;
  terminal: ThemeTerminalPalette;
}

export const THEME_PRESET_OPTIONS: Array<{ value: ThemePresetId; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
];

const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  light: {
    id: "light",
    label: "Light",
    colorScheme: "light",
    app: {
      background: "#f3f5f8",
      surface: "#fcfdff",
      surfaceMuted: "#eef2f7",
      textPrimary: "#16202b",
      textMuted: "#67768a",
      border: "#c8d2df",
      borderMuted: "#dde5ef",
      overlayBackdrop: "rgba(15, 23, 42, 0.08)",
      historyCommand: "#3159b8",
      historyAccent: "#6b77d4",
      historyString: "#8b5a2b",
      historyPath: "#2d6a4f",
      historyUrl: "#2d6f95",
      historyError: "#b14b52",
      historyWarning: "#b2863a",
      historySuccess: "#2d7c65",
      historyNumber: "#3d6f9c",
    },
    terminal: {
      background: "#f9fbff",
      foreground: "#16202b",
      cursor: "#3159b8",
      black: "#1f2a36",
      red: "#b14b52",
      green: "#2d7c65",
      yellow: "#a67f3e",
      blue: "#4f6fb8",
      magenta: "#6b77d4",
      cyan: "#3b7c8f",
      white: "#d7dee8",
      brightBlack: "#5f6f84",
      brightRed: "#cb6870",
      brightGreen: "#3d9478",
      brightYellow: "#c39a4d",
      brightBlue: "#7394dd",
      brightMagenta: "#8d97ea",
      brightCyan: "#5297ab",
      brightWhite: "#ffffff",
    },
  },
  dark: {
    id: "dark",
    label: "Dark",
    colorScheme: "dark",
    app: {
      background: "#0d1117",
      surface: "#121821",
      surfaceMuted: "#18202b",
      textPrimary: "#edf2f7",
      textMuted: "#91a0b3",
      border: "#2a3442",
      borderMuted: "#202938",
      overlayBackdrop: "rgba(2, 6, 23, 0.74)",
      historyCommand: "#93adf5",
      historyAccent: "#aebcff",
      historyString: "#d7b07b",
      historyPath: "#7fb89a",
      historyUrl: "#80b7d8",
      historyError: "#e79097",
      historyWarning: "#d6bb74",
      historySuccess: "#76b59b",
      historyNumber: "#7ea7d8",
    },
    terminal: {
      background: "#111723",
      foreground: "#e6edf5",
      cursor: "#e6edf5",
      black: "#101620",
      red: "#d97f88",
      green: "#73af94",
      yellow: "#ccb16a",
      blue: "#7ea2ff",
      magenta: "#9eaef8",
      cyan: "#72a9c7",
      white: "#d6dce6",
      brightBlack: "#5d6b7d",
      brightRed: "#eca2aa",
      brightGreen: "#8ec6ad",
      brightYellow: "#dfc989",
      brightBlue: "#a9c1ff",
      brightMagenta: "#becbff",
      brightCyan: "#97c1d8",
      brightWhite: "#f6f9fc",
    },
  },
  sepia: {
    id: "sepia",
    label: "Sepia",
    colorScheme: "light",
    app: {
      background: "#f3eadc",
      surface: "#fcf7ef",
      surfaceMuted: "#f1e5d2",
      textPrimary: "#312519",
      textMuted: "#746351",
      border: "#c9b79f",
      borderMuted: "#dfd1bf",
      overlayBackdrop: "rgba(68, 45, 20, 0.12)",
      historyCommand: "#5a4fb2",
      historyAccent: "#8b4f7f",
      historyString: "#9a5d12",
      historyPath: "#4e7b4d",
      historyUrl: "#0d7487",
      historyError: "#a1452d",
      historyWarning: "#a16f1b",
      historySuccess: "#557a2b",
      historyNumber: "#87612f",
    },
    terminal: {
      background: "#f8f1e7",
      foreground: "#2f2419",
      cursor: "#2f2419",
      black: "#3b2f22",
      red: "#a1452d",
      green: "#557a2b",
      yellow: "#a16f1b",
      blue: "#5a4fb2",
      magenta: "#8b4f7f",
      cyan: "#0d7487",
      white: "#d9c8ad",
      brightBlack: "#7f715e",
      brightRed: "#bf6549",
      brightGreen: "#6d9640",
      brightYellow: "#bc8a36",
      brightBlue: "#776bd0",
      brightMagenta: "#a76696",
      brightCyan: "#2f8ea1",
      brightWhite: "#f7efe2",
    },
  },
};

export function getThemePreset(themePreset: ThemePresetId): ThemePreset {
  return THEME_PRESETS[themePreset] ?? THEME_PRESETS.light;
}

export function isThemePresetId(value: string | undefined): value is ThemePresetId {
  return value === "light" || value === "dark" || value === "sepia";
}
