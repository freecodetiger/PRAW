import type { AiConfig, AppConfig, TerminalConfig } from "./types";

export const DEFAULT_APP_CONFIG: AppConfig = {
  terminal: {
    defaultShell: "/bin/bash",
    defaultCwd: "~",
    fontFamily:
      "\"CaskaydiaCove Nerd Font\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono\", \"JetBrains Mono\", monospace",
    fontSize: 14,
  },
  ai: {
    provider: "glm",
    model: "glm-5-flash",
    enabled: false,
    apiKey: "",
    themeColor: "#1f5eff",
    backgroundColor: "#eef4ff",
  },
};

export interface AppConfigInput {
  terminal?: Partial<TerminalConfig>;
  ai?: Partial<AiConfig>;
}

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 32;

export function resolveAppConfig(input?: AppConfigInput | null): AppConfig {
  const terminal = input?.terminal;
  const ai = input?.ai;

  return {
    terminal: {
      defaultShell: normalizeString(terminal?.defaultShell, DEFAULT_APP_CONFIG.terminal.defaultShell),
      defaultCwd: normalizeString(terminal?.defaultCwd, DEFAULT_APP_CONFIG.terminal.defaultCwd),
      fontFamily: normalizeString(terminal?.fontFamily, DEFAULT_APP_CONFIG.terminal.fontFamily),
      fontSize: normalizeFontSize(terminal?.fontSize),
    },
    ai: {
      provider: normalizeAiIdentifier(ai?.provider, DEFAULT_APP_CONFIG.ai.provider),
      model: normalizeAiIdentifier(ai?.model, DEFAULT_APP_CONFIG.ai.model),
      enabled: typeof ai?.enabled === "boolean" ? ai.enabled : DEFAULT_APP_CONFIG.ai.enabled,
      apiKey: normalizeOptionalString(ai?.apiKey),
      themeColor: normalizeHexColor(ai?.themeColor, DEFAULT_APP_CONFIG.ai.themeColor),
      backgroundColor: normalizeHexColor(ai?.backgroundColor, DEFAULT_APP_CONFIG.ai.backgroundColor),
    },
  };
}

function normalizeString(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAiIdentifier(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeOptionalString(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeFontSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_APP_CONFIG.terminal.fontSize;
  }

  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}
