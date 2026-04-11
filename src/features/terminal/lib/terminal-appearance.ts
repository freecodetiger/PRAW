interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
}

interface TerminalLike {
  options: {
    fontFamily?: string;
    fontSize?: number;
  };
}

export function applyTerminalAppearance(terminal: TerminalLike, appearance: TerminalAppearance): void {
  terminal.options.fontFamily = appearance.fontFamily;
  terminal.options.fontSize = appearance.fontSize;
}
