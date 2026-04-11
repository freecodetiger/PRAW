export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  fontFamily: string;
  fontSize: number;
}

export interface AiConfig {
  provider: string;
  model: string;
  enabled: boolean;
  themeColor: string;
  backgroundColor: string;
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
}
