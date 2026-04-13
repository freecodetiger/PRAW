import type { ThemePresetId } from "../theme/presets";
import type { SettingsPanelLanguage } from "./settings-panel-language";
import type { TerminalShortcutConfig } from "./terminal-shortcuts";

export type TerminalPreferredMode = "dialog" | "classic";

export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  dialogFontFamily: string;
  dialogFontSize: number;
  preferredMode: TerminalPreferredMode;
  themePreset: ThemePresetId;
  shortcuts: TerminalShortcutConfig;
  phrases: string[];
  phraseUsage: Record<string, number>;
}

export interface AiConfig {
  provider: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  smartSuggestionBubble: boolean;
  apiKey: string;
  themeColor: string;
  backgroundColor: string;
}

export interface UiConfig {
  settingsPanelLanguage: SettingsPanelLanguage;
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
  ui: UiConfig;
}
