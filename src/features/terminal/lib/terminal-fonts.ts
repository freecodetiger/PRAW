import {
  CLASSIC_TERMINAL_FONT_SIZE,
  DEFAULT_BUNDLED_MONO_FONT_FAMILY,
} from "../../../domain/config/font-defaults";
import type { PaneRenderMode } from "../../../domain/terminal/dialog";

interface DialogFontSettings {
  dialogFontFamily: string;
  dialogFontSize: number;
}

export function resolveTerminalRenderFont(mode: PaneRenderMode, settings: DialogFontSettings) {
  return mode === "classic"
    ? {
        fontFamily: DEFAULT_BUNDLED_MONO_FONT_FAMILY,
        fontSize: CLASSIC_TERMINAL_FONT_SIZE,
      }
    : {
        fontFamily: settings.dialogFontFamily,
        fontSize: settings.dialogFontSize,
      };
}
