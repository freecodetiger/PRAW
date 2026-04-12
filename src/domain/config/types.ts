import type { ThemePresetId } from "../theme/presets";

export type TerminalPreferredMode = "dialog" | "classic";

export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  dialogFontFamily: string;
  dialogFontSize: number;
  preferredMode: TerminalPreferredMode;
  themePreset: ThemePresetId;
  phrases: string[];
  phraseUsage: Record<string, number>;
}

export interface AiConfig {
  provider: string;
  model: string;
  enabled: boolean;
  apiKey: string;
  themeColor: string;
  backgroundColor: string;
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
}
