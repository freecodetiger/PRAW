export type TerminalPreferredMode = "dialog" | "classic";

export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  fontFamily: string;
  fontSize: number;
  preferredMode: TerminalPreferredMode;
}

export interface AiConfig {
  provider: string;
  model: string;
  enabled: boolean;
  apiKey: string;
  themeColor: string;
  backgroundColor: string;
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
}
