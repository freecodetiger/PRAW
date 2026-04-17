import { describe, expect, it } from "vitest";

import { AI_PROVIDER_OPTIONS, getAiProviderOption } from "../ai/catalog";
import type { AiCapability, CompletionProvider } from "../ai/types";
import { DEFAULT_APP_CONFIG, resolveAppConfig } from "./model";
import { resolvePlatformDefaultShell } from "./default-shell";

describe("resolveAppConfig", () => {
  it("uses zsh as the platform default shell on macOS", () => {
    expect(resolvePlatformDefaultShell("MacIntel")).toBe("/bin/zsh");
  });

  it("keeps bash as the platform default shell outside macOS", () => {
    expect(resolvePlatformDefaultShell("Linux x86_64")).toBe("/bin/bash");
    expect(resolvePlatformDefaultShell(undefined)).toBe("/bin/bash");
  });

  it("uses the bundled mono font as the default dialog font", () => {
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontFamily).toBe(
      "\"CaskaydiaCove Nerd Font Mono\", \"CaskaydiaCove Nerd Font\", monospace",
    );
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontSize).toBe(14);
  });

  it("does not preconfigure a default ai provider or model", () => {
    expect(DEFAULT_APP_CONFIG.ai.provider).toBe("");
    expect(DEFAULT_APP_CONFIG.ai.model).toBe("");
    expect(DEFAULT_APP_CONFIG.ai.smartSuggestionBubble).toBe(true);
  });

  it("defaults speech input to an opt-in aliyun realtime profile", () => {
    expect(DEFAULT_APP_CONFIG.speech).toEqual({
      enabled: false,
      provider: "aliyun-paraformer-realtime",
      apiKey: "",
      language: "auto",
    });
  });

  it("exposes all first-wave providers in the catalog", () => {
    expect(AI_PROVIDER_OPTIONS.map((option) => option.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "xai",
      "glm",
      "deepseek",
      "qwen",
      "doubao",
    ] satisfies CompletionProvider[]);
  });

  it("marks completion and connection-test capabilities explicitly", () => {
    const glm = getAiProviderOption("glm");

    expect(glm?.capabilities).toContain("completion" satisfies AiCapability);
    expect(glm?.capabilities).toContain("connectionTest" satisfies AiCapability);
  });

  it("fills missing terminal and ai settings from defaults", () => {
    expect(
      resolveAppConfig({
        terminal: {
          defaultShell: "/usr/bin/zsh",
        },
        ai: {
          enabled: true,
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        defaultShell: "/usr/bin/zsh",
      },
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        enabled: true,
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("normalizes api keys without dropping them from ai config", () => {
    expect(
      resolveAppConfig({
        ai: {
          apiKey: "  secret-key  ",
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        apiKey: "secret-key",
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("normalizes speech settings without dropping the stored speech api key", () => {
    expect(
      resolveAppConfig({
        speech: {
          enabled: true,
          provider: "  custom-provider  " as never,
          apiKey: "  speech-key  ",
          language: " EN " as never,
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: DEFAULT_APP_CONFIG.ai,
      speech: {
        enabled: true,
        provider: "custom-provider",
        apiKey: "speech-key",
        language: "en",
      },
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("falls back to the default speech provider and language when values are invalid", () => {
    expect(
      resolveAppConfig({
        speech: {
          provider: "   " as never,
          language: "ja" as never,
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("preserves an explicitly configured ai base url", () => {
    expect(
      resolveAppConfig({
        ai: {
          provider: "openai",
          model: "gpt-4.1-mini",
          baseUrl: " https://proxy.example.com/v1 ",
        } as never,
      }).ai.baseUrl,
    ).toBe("https://proxy.example.com/v1");
  });

  it("keeps baseUrl empty when not configured", () => {
    expect(resolveAppConfig({ ai: { provider: "glm" } }).ai.baseUrl).toBe("");
  });

  it("normalizes ai provider and model identifiers to lowercase", () => {
    expect(
      resolveAppConfig({
        ai: {
          provider: " GLM ",
          model: " GLM-4.7-Flash ",
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        provider: "glm",
        model: "glm-4.7-flash",
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("preserves blank ai provider and model values instead of falling back", () => {
    expect(
      resolveAppConfig({
        ai: {
          provider: "   ",
          model: "   ",
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        provider: "",
        model: "",
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("clamps invalid dialog font settings and terminal presentation values", () => {
    expect(
      resolveAppConfig({
        terminal: {
          fontFamily: "   ",
          fontSize: 4,
          preferredMode: "invalid" as never,
        },
      }),
    ).toEqual({
      ...DEFAULT_APP_CONFIG,
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        dialogFontFamily: DEFAULT_APP_CONFIG.terminal.dialogFontFamily,
        dialogFontSize: 10,
        preferredMode: DEFAULT_APP_CONFIG.terminal.preferredMode,
      },
    });
  });

  it("migrates legacy shared font keys into dialog font settings", () => {
    expect(
      resolveAppConfig({
        terminal: {
          fontFamily: "JetBrains Mono",
          fontSize: 16,
        } as never,
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 16,
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("migrates the legacy classic terminal preference back to the block workspace preference", () => {
    expect(
      resolveAppConfig({
        terminal: {
          preferredMode: "classic",
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        preferredMode: "dialog",
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("normalizes ai appearance colors", () => {
    expect(
      resolveAppConfig({
        ai: {
          themeColor: "#2b6fff",
          backgroundColor: "invalid",
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        themeColor: "#2b6fff",
        backgroundColor: DEFAULT_APP_CONFIG.ai.backgroundColor,
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("defaults smart suggestion bubble and preserves explicit overrides", () => {
    expect(
      resolveAppConfig({
        ai: {
          smartSuggestionBubble: false,
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        smartSuggestionBubble: false,
      },
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("normalizes imported phrase lists and drops stale usage entries", () => {
    expect(
      resolveAppConfig({
        terminal: {
          phrases: ["  codex  ", "claude", "codex", "   "] as never,
          phraseUsage: {
            codex: 9,
            claude: 3,
            "cd projects/": 7,
          } as never,
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        phrases: ["codex", "claude"],
        phraseUsage: {
          codex: 9,
          claude: 3,
        },
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("defaults invalid theme presets back to light", () => {
    expect(
      resolveAppConfig({
        terminal: {
          themePreset: "noir" as never,
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        themePreset: "light",
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("fills missing pane shortcuts from defaults", () => {
    expect(
      resolveAppConfig({
        terminal: {
          defaultShell: "/usr/bin/zsh",
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        defaultShell: "/usr/bin/zsh",
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("falls back to default shortcuts for malformed shortcut config", () => {
    expect(
      resolveAppConfig({
        terminal: {
          shortcuts: {
            splitRight: { key: "", ctrl: true, alt: true, shift: false, meta: false },
          } as never,
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("preserves explicitly cleared pane shortcuts", () => {
    expect(
      resolveAppConfig({
        terminal: {
          shortcuts: {
            editNote: null,
          } as never,
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        shortcuts: {
          ...DEFAULT_APP_CONFIG.terminal.shortcuts,
          editNote: null,
        },
      },
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: DEFAULT_APP_CONFIG.ui,
    });
  });

  it("defaults settings panel language to english", () => {
    expect(resolveAppConfig()).toEqual(DEFAULT_APP_CONFIG);
    expect(DEFAULT_APP_CONFIG.ui.settingsPanelLanguage).toBe("en");
  });

  it("accepts zh-CN for settings panel language", () => {
    expect(
      resolveAppConfig({
        ui: {
          settingsPanelLanguage: "zh-CN",
        },
      }),
    ).toEqual({
      terminal: DEFAULT_APP_CONFIG.terminal,
      ai: DEFAULT_APP_CONFIG.ai,
      speech: DEFAULT_APP_CONFIG.speech,
      ui: {
        settingsPanelLanguage: "zh-CN",
      },
    });
  });

  it("falls back to english for invalid settings panel language values", () => {
    expect(
      resolveAppConfig({
        ui: {
          settingsPanelLanguage: "fr" as never,
        },
      }),
    ).toEqual(DEFAULT_APP_CONFIG);
  });
});
