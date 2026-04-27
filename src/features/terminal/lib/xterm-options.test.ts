import { describe, expect, it } from "vitest";

import { getThemePreset } from "../../../domain/theme/presets";
import { createPersistentTerminalOptions } from "./xterm-options";

describe("xterm options", () => {
  it("uses PTY-safe defaults for persistent terminals", () => {
    expect(
      createPersistentTerminalOptions({
        fontFamily: "IBM Plex Mono",
        fontSize: 15,
        theme: getThemePreset("light").terminal,
      }),
    ).toMatchObject({
      altClickMovesCursor: false,
      fontFamily: "IBM Plex Mono",
      fontSize: 15,
      cursorBlink: true,
      convertEol: false,
      allowTransparency: false,
      allowProposedApi: true,
    });
  });
});
