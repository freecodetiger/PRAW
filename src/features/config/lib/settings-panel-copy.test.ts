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
});
