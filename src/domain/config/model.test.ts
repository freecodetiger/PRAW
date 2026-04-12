import { describe, expect, it } from "vitest";

import { DEFAULT_APP_CONFIG, resolveAppConfig } from "./model";

describe("resolveAppConfig", () => {
  it("uses the bundled mono font as the default dialog font", () => {
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontFamily).toBe(
      "\"CaskaydiaCove Nerd Font Mono\", \"CaskaydiaCove Nerd Font\", monospace",
    );
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontSize).toBe(14);
  });

  it("does not preconfigure a default ai provider or model", () => {
    expect(DEFAULT_APP_CONFIG.ai.provider).toBe("");
    expect(DEFAULT_APP_CONFIG.ai.model).toBe("");
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
    });
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
    });
  });

  it("accepts the classic terminal preference", () => {
    expect(
      resolveAppConfig({
        terminal: {
          preferredMode: "classic",
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        preferredMode: "classic",
      },
      ai: DEFAULT_APP_CONFIG.ai,
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
    });
  });
});
