import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { useAppConfigStore } from "./app-config-store";

describe("app-config-store", () => {
  beforeEach(() => {
    useAppConfigStore.setState({
      config: DEFAULT_APP_CONFIG,
      hydrateConfig: useAppConfigStore.getState().hydrateConfig,
      patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
      patchAiConfig: useAppConfigStore.getState().patchAiConfig,
      patchSpeechConfig: useAppConfigStore.getState().patchSpeechConfig,
      patchUiConfig: useAppConfigStore.getState().patchUiConfig,
    });
  });

  it("patches terminal settings and normalizes invalid values", () => {
    useAppConfigStore.getState().patchTerminalConfig({
      defaultShell: "/usr/bin/zsh",
      dialogFontFamily: "   ",
      dialogFontSize: 99,
      preferredMode: "classic",
    } as never);

    expect(useAppConfigStore.getState().config.terminal).toEqual({
      ...DEFAULT_APP_CONFIG.terminal,
      defaultShell: "/usr/bin/zsh",
      dialogFontFamily: DEFAULT_APP_CONFIG.terminal.dialogFontFamily,
      dialogFontSize: 32,
      preferredMode: "dialog",
    });
  });

  it("patches dialog font settings without reintroducing shared terminal font fields", () => {
    useAppConfigStore.getState().patchTerminalConfig({
      dialogFontFamily: "IBM Plex Mono",
      dialogFontSize: 15,
    } as never);

    expect(useAppConfigStore.getState().config.terminal.dialogFontFamily).toBe("IBM Plex Mono");
    expect(useAppConfigStore.getState().config.terminal.dialogFontSize).toBe(15);
  });

  it("patches ai settings without disturbing terminal config", () => {
    useAppConfigStore.getState().patchAiConfig({
      enabled: true,
      smartSuggestionBubble: false,
      provider: "glm",
      model: "glm-4.5",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "secret-key",
      themeColor: "#2b6fff",
      backgroundColor: "#eef4ff",
    });

    expect(useAppConfigStore.getState().config.ai).toEqual({
      enabled: true,
      smartSuggestionBubble: false,
      provider: "glm",
      model: "glm-4.5",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "secret-key",
      themeColor: "#2b6fff",
      backgroundColor: "#eef4ff",
    });
    expect(useAppConfigStore.getState().config.terminal).toEqual(DEFAULT_APP_CONFIG.terminal);
  });

  it("patches terminal phrase config through the app config store", () => {
    useAppConfigStore.getState().patchTerminalConfig({
      phrases: ["  codex  ", "claude", "codex"] as never,
      phraseUsage: { codex: 4, claude: 2, ghost: 1 } as never,
    });

    expect(useAppConfigStore.getState().config.terminal).toEqual({
      ...DEFAULT_APP_CONFIG.terminal,
      phrases: ["codex", "claude"],
      phraseUsage: { codex: 4, claude: 2 },
    });
  });

  it("patches terminal theme presets through the app config store", () => {
    useAppConfigStore.getState().patchTerminalConfig({
      themePreset: "sepia" as never,
    });

    expect(useAppConfigStore.getState().config.terminal.themePreset).toBe("sepia");
  });

  it("patches terminal pane shortcuts through the app config store", () => {
    useAppConfigStore.getState().patchTerminalConfig({
      shortcuts: {
        splitRight: { key: "=", ctrl: true, alt: true, shift: false, meta: false },
        splitDown: { key: "-", ctrl: true, alt: true, shift: false, meta: false },
        editNote: null,
        toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
      } as never,
    });

    expect(useAppConfigStore.getState().config.terminal.shortcuts).toEqual({
      splitRight: { key: "=", ctrl: true, alt: true, shift: false, meta: false },
      splitDown: { key: "-", ctrl: true, alt: true, shift: false, meta: false },
      editNote: null,
      toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
    });
  });

  it("patches speech settings without disturbing terminal and ai config", () => {
    useAppConfigStore.getState().patchSpeechConfig({
      enabled: true,
      provider: "aliyun-paraformer-realtime",
      apiKey: "speech-key",
      language: "zh",
    });

    expect(useAppConfigStore.getState().config.speech).toEqual({
      enabled: true,
      provider: "aliyun-paraformer-realtime",
      apiKey: "speech-key",
      language: "zh",
    });
    expect(useAppConfigStore.getState().config.terminal).toEqual(DEFAULT_APP_CONFIG.terminal);
    expect(useAppConfigStore.getState().config.ai).toEqual(DEFAULT_APP_CONFIG.ai);
  });

  it("patches ui settings without disturbing terminal and ai config", () => {
    useAppConfigStore.getState().patchUiConfig({
      settingsPanelLanguage: "zh-CN",
    });

    expect(useAppConfigStore.getState().config.ui.settingsPanelLanguage).toBe("zh-CN");
    expect(useAppConfigStore.getState().config.terminal).toEqual(DEFAULT_APP_CONFIG.terminal);
    expect(useAppConfigStore.getState().config.ai).toEqual(DEFAULT_APP_CONFIG.ai);
    expect(useAppConfigStore.getState().config.speech).toEqual(DEFAULT_APP_CONFIG.speech);
  });
});
