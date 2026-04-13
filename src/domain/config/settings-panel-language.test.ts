import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS_PANEL_LANGUAGE,
  normalizeSettingsPanelLanguage,
} from "./settings-panel-language";

describe("settings panel language", () => {
  it("defaults to english", () => {
    expect(DEFAULT_SETTINGS_PANEL_LANGUAGE).toBe("en");
  });

  it("accepts zh-CN", () => {
    expect(normalizeSettingsPanelLanguage("zh-CN")).toBe("zh-CN");
  });

  it("falls back to english for invalid values", () => {
    expect(normalizeSettingsPanelLanguage("fr")).toBe("en");
  });
});
