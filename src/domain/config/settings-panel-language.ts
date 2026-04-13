export type SettingsPanelLanguage = "en" | "zh-CN";

export const DEFAULT_SETTINGS_PANEL_LANGUAGE: SettingsPanelLanguage = "en";

export function normalizeSettingsPanelLanguage(value: unknown): SettingsPanelLanguage {
  return value === "zh-CN" ? "zh-CN" : "en";
}
