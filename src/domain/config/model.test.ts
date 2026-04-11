import { describe, expect, it } from "vitest";

import { DEFAULT_APP_CONFIG, resolveAppConfig } from "./model";

describe("resolveAppConfig", () => {
  it("uses the expected terminal font default", () => {
    expect(DEFAULT_APP_CONFIG.terminal.fontFamily).toBe(
      "\"CaskaydiaCove Nerd Font\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono\", \"JetBrains Mono\", monospace",
    );
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

  it("clamps invalid terminal presentation values", () => {
    expect(
      resolveAppConfig({
        terminal: {
          fontFamily: "   ",
          fontSize: 4,
        },
      }),
    ).toEqual({
      ...DEFAULT_APP_CONFIG,
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        fontFamily: DEFAULT_APP_CONFIG.terminal.fontFamily,
        fontSize: 10,
      },
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
});
