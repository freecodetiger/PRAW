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
      preferredMode: "classic",
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
      provider: "glm",
      model: "glm-4.5",
      apiKey: "secret-key",
      themeColor: "#2b6fff",
      backgroundColor: "#eef4ff",
    });

    expect(useAppConfigStore.getState().config.ai).toEqual({
      enabled: true,
      provider: "glm",
      model: "glm-4.5",
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
});
