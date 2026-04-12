import type { ThemeTerminalPalette } from "../../../domain/theme/presets";

interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  theme: Partial<ThemeTerminalPalette>;
}

interface TerminalLike {
  options: {
    fontFamily?: string;
    fontSize?: number;
    theme?: Partial<ThemeTerminalPalette>;
  };
}

export function applyTerminalAppearance(terminal: TerminalLike, appearance: TerminalAppearance): void {
  terminal.options.fontFamily = appearance.fontFamily;
  terminal.options.fontSize = appearance.fontSize;
  terminal.options.theme = {
    ...terminal.options.theme,
    ...appearance.theme,
  };
}
