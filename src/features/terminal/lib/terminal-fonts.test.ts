import { describe, expect, it } from "vitest";

import {
  CLASSIC_TERMINAL_FONT_SIZE,
  DEFAULT_BUNDLED_MONO_FONT_FAMILY,
} from "../../../domain/config/font-defaults";
import { resolveTerminalRenderFont } from "./terminal-fonts";

describe("resolveTerminalRenderFont", () => {
  it("locks classic mode to the bundled mono font and fixed size", () => {
    expect(
      resolveTerminalRenderFont("classic", {
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 17,
      }),
    ).toEqual({
      fontFamily: DEFAULT_BUNDLED_MONO_FONT_FAMILY,
      fontSize: CLASSIC_TERMINAL_FONT_SIZE,
    });
  });

  it("uses dialog settings for dialog mode", () => {
    expect(
      resolveTerminalRenderFont("dialog", {
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 17,
      }),
    ).toEqual({
      fontFamily: "JetBrains Mono",
      fontSize: 17,
    });
  });
});
