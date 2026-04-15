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
      background: "#f5f1e8",
      surface: "#fdfaf4",
      surfaceMuted: "#f3ede2",
      textPrimary: "#241f17",
      textMuted: "#756b5f",
      border: "#d8cec1",
      borderMuted: "#e9e0d4",
      overlayBackdrop: "rgba(36, 31, 23, 0.08)",
      historyCommand: "#5c7198",
      historyAccent: "#7c85b2",
      historyString: "#90613a",
      historyPath: "#4d6f58",
      historyUrl: "#55758e",
      historyError: "#b36563",
      historyWarning: "#b38a50",
      historySuccess: "#4f7d69",
      historyNumber: "#637d9f",
    },
    terminal: {
      background: "#fbf8f2",
      foreground: "#241f17",
      cursor: "#5c7198",
      black: "#2f2a22",
      red: "#b36563",
      green: "#4f7d69",
      yellow: "#af8750",
      blue: "#6e83ac",
      magenta: "#7c85b2",
      cyan: "#5e8197",
      white: "#dfd7cb",
      brightBlack: "#7f7568",
      brightRed: "#ca807d",
      brightGreen: "#668f79",
      brightYellow: "#c39a61",
      brightBlue: "#8798bf",
      brightMagenta: "#969dc6",
      brightCyan: "#7497ad",
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
