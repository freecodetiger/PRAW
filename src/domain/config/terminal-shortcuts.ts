export interface ShortcutBinding {
  key: string;
  code?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface TerminalShortcutConfig {
  splitRight: ShortcutBinding | null;
  splitDown: ShortcutBinding | null;
  editNote: ShortcutBinding | null;
  toggleFocusPane: ShortcutBinding | null;
  toggleAiVoiceBypass: ShortcutBinding | null;
}

export type TerminalShortcutConfigKey = keyof TerminalShortcutConfig;

interface ShortcutCaptureEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

const SHORTCUT_CODE_KEY_LABELS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Enter: "Enter",
};

const SHORTCUT_KEY_CODE_LABELS: Record<string, string> = {
  "`": "Backquote",
  "~": "Backquote",
  "-": "Minus",
  "_": "Minus",
  "=": "Equal",
  "+": "Equal",
  "[": "BracketLeft",
  "{": "BracketLeft",
  "]": "BracketRight",
  "}": "BracketRight",
  "\\": "Backslash",
  "|": "Backslash",
  ";": "Semicolon",
  ":": "Semicolon",
  "'": "Quote",
  '"': "Quote",
  ",": "Comma",
  "<": "Comma",
  ".": "Period",
  ">": "Period",
  "/": "Slash",
  "?": "Slash",
};

export const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutConfig = {
  splitRight: { key: "[", code: "BracketLeft", ctrl: true, alt: true, shift: false, meta: false },
  splitDown: { key: "]", code: "BracketRight", ctrl: true, alt: true, shift: false, meta: false },
  editNote: { key: "\\", code: "Backslash", ctrl: true, alt: true, shift: false, meta: false },
  toggleFocusPane: { key: "Enter", code: "Enter", ctrl: true, alt: true, shift: false, meta: false },
  toggleAiVoiceBypass: { key: "/", code: "Slash", ctrl: true, alt: true, shift: true, meta: false },
};

export function normalizeTerminalShortcutConfig(
  value: Partial<Record<keyof TerminalShortcutConfig, ShortcutBinding | null>> | undefined,
): TerminalShortcutConfig {
  const normalized: TerminalShortcutConfig = {
    splitRight: normalizeShortcutBinding(value?.splitRight, DEFAULT_TERMINAL_SHORTCUTS.splitRight),
    splitDown: normalizeShortcutBinding(value?.splitDown, DEFAULT_TERMINAL_SHORTCUTS.splitDown),
    editNote: normalizeShortcutBinding(value?.editNote, DEFAULT_TERMINAL_SHORTCUTS.editNote),
    toggleFocusPane: normalizeShortcutBinding(value?.toggleFocusPane, DEFAULT_TERMINAL_SHORTCUTS.toggleFocusPane),
    toggleAiVoiceBypass: normalizeShortcutBinding(value?.toggleAiVoiceBypass, DEFAULT_TERMINAL_SHORTCUTS.toggleAiVoiceBypass),
  };

  return hasDuplicateShortcutBindings(normalized) ? cloneShortcutConfig(DEFAULT_TERMINAL_SHORTCUTS) : normalized;
}

export function hasDuplicateShortcutBindings(config: TerminalShortcutConfig): boolean {
  const seen = new Set<string>();

  for (const binding of Object.values(config)) {
    if (!binding) {
      continue;
    }

    const signature = createShortcutSignature(binding);
    if (seen.has(signature)) {
      return true;
    }

    seen.add(signature);
  }

  return false;
}

export function findShortcutConflict(
  config: TerminalShortcutConfig,
  candidate: ShortcutBinding,
  currentKey?: TerminalShortcutConfigKey,
): TerminalShortcutConfigKey | null {
  const candidateSignature = createShortcutSignature(candidate);

  for (const [key, binding] of Object.entries(config) as Array<[TerminalShortcutConfigKey, ShortcutBinding | null]>) {
    if (key === currentKey || !binding) {
      continue;
    }

    if (createShortcutSignature(binding) === candidateSignature) {
      return key;
    }
  }

  return null;
}

export function formatShortcutBinding(binding: ShortcutBinding | null): string {
  if (!binding) {
    return "Unassigned";
  }

  const parts = [
    binding.ctrl ? "Ctrl" : null,
    binding.alt ? "Alt" : null,
    binding.shift ? "Shift" : null,
    binding.meta ? "Meta" : null,
    binding.key,
  ].filter((value): value is string => value !== null);

  return parts.join("+");
}

export function isModifierOnlyShortcutKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);
  return normalizedKey === "control" || normalizedKey === "shift" || normalizedKey === "alt" || normalizedKey === "meta";
}

export function toShortcutBinding(event: ShortcutCaptureEvent): ShortcutBinding | null {
  const key = event.key.trim();
  const normalizedKey = normalizeKey(key);
  if (
    event.isComposing ||
    key.length === 0 ||
    normalizedKey === "process" ||
    normalizedKey === "dead" ||
    isModifierOnlyShortcutKey(key)
  ) {
    return null;
  }

  const code = normalizeShortcutCode(event.code, key);
  return {
    key: canonicalShortcutKey(key, code),
    ...(code ? { code } : {}),
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

function normalizeShortcutBinding(
  value: ShortcutBinding | null | undefined,
  fallback: ShortcutBinding | null,
): ShortcutBinding | null {
  if (value === null) {
    return null;
  }

  if (!isShortcutBinding(value)) {
    return cloneShortcutBinding(fallback);
  }

  const code = normalizeShortcutCode(value.code, value.key);
  return {
    key: canonicalShortcutKey(value.key.trim(), code),
    ...(code ? { code } : {}),
    ctrl: value.ctrl,
    alt: value.alt,
    shift: value.shift,
    meta: value.meta,
  };
}

function isShortcutBinding(value: unknown): value is ShortcutBinding {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.key === "string" &&
    value.key.trim().length > 0 &&
    (value.code === undefined || typeof value.code === "string") &&
    typeof value.ctrl === "boolean" &&
    typeof value.alt === "boolean" &&
    typeof value.shift === "boolean" &&
    typeof value.meta === "boolean"
  );
}

function cloneShortcutConfig(config: TerminalShortcutConfig): TerminalShortcutConfig {
  return {
    splitRight: cloneShortcutBinding(config.splitRight),
    splitDown: cloneShortcutBinding(config.splitDown),
    editNote: cloneShortcutBinding(config.editNote),
    toggleFocusPane: cloneShortcutBinding(config.toggleFocusPane),
    toggleAiVoiceBypass: cloneShortcutBinding(config.toggleAiVoiceBypass),
  };
}

function cloneShortcutBinding(binding: ShortcutBinding | null): ShortcutBinding | null {
  return binding ? { ...binding } : null;
}

function createShortcutSignature(binding: ShortcutBinding): string {
  const identity = normalizeShortcutCode(binding.code, binding.key);
  const normalizedIdentity = identity ? normalizeKey(identity) : normalizeKey(binding.key);
  return `${normalizedIdentity}|${binding.ctrl ? 1 : 0}|${binding.alt ? 1 : 0}|${binding.shift ? 1 : 0}|${binding.meta ? 1 : 0}`;
}

function normalizeShortcutCode(code: string | undefined, key: string): string | undefined {
  const trimmedCode = code?.trim();
  if (trimmedCode) {
    return trimmedCode;
  }

  return inferShortcutCodeFromKey(key.trim());
}

function inferShortcutCodeFromKey(key: string): string | undefined {
  if (key.length === 0) {
    return undefined;
  }

  if (key === "Enter") {
    return "Enter";
  }

  if (/^[a-z]$/i.test(key)) {
    return `Key${key.toUpperCase()}`;
  }

  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }

  return SHORTCUT_KEY_CODE_LABELS[key];
}

function canonicalShortcutKey(key: string, code: string | undefined): string {
  if (code) {
    const mapped = displayKeyFromCode(code);
    if (mapped) {
      return mapped;
    }
  }

  return key;
}

function displayKeyFromCode(code: string): string | undefined {
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }

  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }

  return SHORTCUT_CODE_KEY_LABELS[code];
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
