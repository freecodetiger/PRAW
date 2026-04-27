import type { ITerminalOptions } from "@xterm/xterm";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";

interface PersistentTerminalOptionConfig {
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
}

export function createPersistentTerminalOptions(config: PersistentTerminalOptionConfig): ITerminalOptions {
  return {
    allowTransparency: false,
    allowProposedApi: true,
    altClickMovesCursor: false,
    convertEol: false,
    cursorBlink: true,
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    lineHeight: 1.3,
    theme: config.theme,
  };
}
