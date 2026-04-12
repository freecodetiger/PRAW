interface DialogPtyKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const CONTROL_KEY_SEQUENCES = new Map<string, string>([
  ["enter", "\r"],
  ["tab", "\t"],
  ["backspace", "\u007f"],
  ["escape", "\u001b"],
  ["arrowup", "\u001b[A"],
  ["arrowdown", "\u001b[B"],
  ["arrowright", "\u001b[C"],
  ["arrowleft", "\u001b[D"],
  ["home", "\u001b[H"],
  ["end", "\u001b[F"],
  ["delete", "\u001b[3~"],
]);

export function resolveDialogPtyKeyInput(event: DialogPtyKeyEvent): string | null {
  const key = event.key.trim();
  const normalizedKey = key.toLowerCase();

  if (event.metaKey || normalizedKey === "process" || normalizedKey === "dead") {
    return null;
  }

  if (event.ctrlKey && event.shiftKey && !event.altKey) {
    if (normalizedKey === "c" || normalizedKey === "v") {
      return null;
    }
  }

  if (CONTROL_KEY_SEQUENCES.has(normalizedKey)) {
    return CONTROL_KEY_SEQUENCES.get(normalizedKey) ?? null;
  }

  if (event.ctrlKey && !event.altKey && normalizedKey.length === 1 && normalizedKey >= "a" && normalizedKey <= "z") {
    return String.fromCharCode(normalizedKey.charCodeAt(0) - 96);
  }

  if (key.length === 1 && !event.ctrlKey) {
    return event.altKey ? `\u001b${key}` : key;
  }

  return null;
}
