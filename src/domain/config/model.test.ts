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
});
