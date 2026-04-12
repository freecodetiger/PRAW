import type { AiConfig, AppConfig, TerminalConfig, TerminalPreferredMode } from "./types";

export const DEFAULT_APP_CONFIG: AppConfig = {
  terminal: {
    defaultShell: "/bin/bash",
    defaultCwd: "~",
    fontFamily:
      "\"CaskaydiaCove Nerd Font\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono\", \"JetBrains Mono\", monospace",
    fontSize: 14,
    preferredMode: "dialog",
    phrases: [],
    phraseUsage: {},
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
  const phrases = normalizePhraseList(terminal?.phrases);

  return {
    terminal: {
      defaultShell: normalizeString(terminal?.defaultShell, DEFAULT_APP_CONFIG.terminal.defaultShell),
      defaultCwd: normalizeString(terminal?.defaultCwd, DEFAULT_APP_CONFIG.terminal.defaultCwd),
      fontFamily: normalizeString(terminal?.fontFamily, DEFAULT_APP_CONFIG.terminal.fontFamily),
      fontSize: normalizeFontSize(terminal?.fontSize),
      preferredMode: normalizePreferredMode(terminal?.preferredMode),
      phrases,
      phraseUsage: normalizePhraseUsage(terminal?.phraseUsage, phrases),
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

function normalizePreferredMode(value: string | undefined): TerminalPreferredMode {
  return value === "classic" ? "classic" : "dialog";
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}

function normalizePhraseList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const phrase = entry.trim();
    if (!phrase || seen.has(phrase)) {
      continue;
    }

    seen.add(phrase);
    normalized.push(phrase);
  }

  return normalized;
}

function normalizePhraseUsage(
  value: Record<string, number> | undefined,
  phrases: string[],
): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowed = new Set(phrases);
  const normalized: Record<string, number> = {};

  for (const [phrase, score] of Object.entries(value)) {
    if (!allowed.has(phrase) || typeof score !== "number" || !Number.isFinite(score) || score < 0) {
      continue;
    }

    normalized[phrase] = Math.floor(score);
  }

  return normalized;
}
