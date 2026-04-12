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
      background: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f5f5f5",
      textPrimary: "#000000",
      textMuted: "#555555",
      border: "#000000",
      borderMuted: "#c8c8c8",
      overlayBackdrop: "rgba(0, 0, 0, 0.06)",
      historyCommand: "#003d99",
      historyAccent: "#6b2f8a",
      historyString: "#7a3e00",
      historyPath: "#0f6b45",
      historyUrl: "#005f8f",
      historyError: "#9f1d1d",
      historyWarning: "#9b7500",
      historySuccess: "#0b7a28",
      historyNumber: "#005f5f",
    },
    terminal: {
      background: "#ffffff",
      foreground: "#000000",
      cursor: "#000000",
      black: "#000000",
      red: "#8a0000",
      green: "#006400",
      yellow: "#7a5c00",
      blue: "#003d99",
      magenta: "#6b2f8a",
      cyan: "#005f5f",
      white: "#d8d8d8",
      brightBlack: "#4a4a4a",
      brightRed: "#b30000",
      brightGreen: "#008000",
      brightYellow: "#9b7500",
      brightBlue: "#0052cc",
      brightMagenta: "#8a3fb3",
      brightCyan: "#007a7a",
      brightWhite: "#f2f2f2",
    },
  },
  dark: {
    id: "dark",
    label: "Dark",
    colorScheme: "dark",
    app: {
      background: "#0f1115",
      surface: "#151922",
      surfaceMuted: "#1b2130",
      textPrimary: "#f5f7fb",
      textMuted: "#a5afc0",
      border: "#6b7280",
      borderMuted: "#313949",
      overlayBackdrop: "rgba(3, 6, 12, 0.74)",
      historyCommand: "#74a7ff",
      historyAccent: "#dba6ff",
      historyString: "#ffbf7a",
      historyPath: "#7bd8a8",
      historyUrl: "#73d2ff",
      historyError: "#ff9a9a",
      historyWarning: "#ffd36b",
      historySuccess: "#8be28b",
      historyNumber: "#79e0d8",
    },
    terminal: {
      background: "#10141c",
      foreground: "#f3f5f7",
      cursor: "#f3f5f7",
      black: "#1b2330",
      red: "#d16969",
      green: "#8fbc8f",
      yellow: "#d7ba7d",
      blue: "#82aaff",
      magenta: "#c792ea",
      cyan: "#89ddff",
      white: "#d0d7e2",
      brightBlack: "#4e5d78",
      brightRed: "#ff8b8b",
      brightGreen: "#a6e3a1",
      brightYellow: "#ffd580",
      brightBlue: "#9fc0ff",
      brightMagenta: "#ddb7ff",
      brightCyan: "#9be7ff",
      brightWhite: "#f8fbff",
    },
  },
  sepia: {
    id: "sepia",
    label: "Sepia",
    colorScheme: "light",
    app: {
      background: "#f4ead7",
      surface: "#fbf3e4",
      surfaceMuted: "#efe2cc",
      textPrimary: "#2f2419",
      textMuted: "#705d49",
      border: "#6e5a46",
      borderMuted: "#b8a58b",
      overlayBackdrop: "rgba(68, 45, 20, 0.14)",
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
      background: "#f7efe2",
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
