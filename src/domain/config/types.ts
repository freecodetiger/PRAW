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
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
}
