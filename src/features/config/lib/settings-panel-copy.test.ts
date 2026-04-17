import { describe, expect, it } from "vitest";

import { getSettingsPanelCopy } from "./settings-panel-copy";

describe("settings panel copy", () => {
  it("returns english copy for en", () => {
    expect(getSettingsPanelCopy("en").header.title).toBe("Runtime profile");
  });

  it("returns chinese copy for zh-CN while preserving product nouns", () => {
    const copy = getSettingsPanelCopy("zh-CN");

    expect(copy.header.title).toBe("运行配置");
    expect(copy.terminal.sectionTitle).toBe("Terminal");
    expect(copy.panelLanguage.label).toBe("Panel Language");
  });

  it("includes focus-pane and AI voice bypass shortcut labels in both locales", () => {
    expect(getSettingsPanelCopy("en").terminal.shortcutLabels.toggleFocusPane).toBe("Toggle Focus Pane");
    expect(getSettingsPanelCopy("zh-CN").terminal.shortcutLabels.toggleFocusPane).toBe("切换聚焦分屏");
    expect(getSettingsPanelCopy("en").terminal.shortcutLabels.toggleAiVoiceBypass).toBe("Toggle AI Voice Bypass");
    expect(getSettingsPanelCopy("zh-CN").terminal.shortcutLabels.toggleAiVoiceBypass).toBe("切换 AI 语音旁路");
  });
});
