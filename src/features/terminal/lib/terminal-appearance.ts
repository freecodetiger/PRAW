interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
}

interface TerminalLike {
  options: {
    fontFamily?: string;
    fontSize?: number;
    theme?: {
      background?: string;
    };
  };
}

export function applyTerminalAppearance(terminal: TerminalLike, appearance: TerminalAppearance): void {
  terminal.options.fontFamily = appearance.fontFamily;
  terminal.options.fontSize = appearance.fontSize;
  terminal.options.theme = {
    ...terminal.options.theme,
    background: appearance.backgroundColor,
  };
}
