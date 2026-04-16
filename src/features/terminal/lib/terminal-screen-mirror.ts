import type { TerminalController } from "./terminal-registry";

const ESC = "\u001b";
const BEL = "\u0007";

export interface TerminalMirrorSnapshot {
  replayText: string;
  exportText: string;
  viewportY: number;
}

interface TerminalMirrorState extends TerminalMirrorSnapshot {
  controller?: TerminalController;
  pendingControl: string;
  pendingCarriageReturn: boolean;
}

const mirrors = new Map<string, TerminalMirrorState>();

export function createMirrorSnapshot(): TerminalMirrorSnapshot {
  return {
    replayText: "",
    exportText: "",
    viewportY: 0,
  };
}

export function getMirrorSnapshot(tabId: string): TerminalMirrorSnapshot {
  const mirror = mirrors.get(tabId);
  if (!mirror) {
    return createMirrorSnapshot();
  }

  return {
    replayText: mirror.replayText,
    exportText: mirror.exportText,
    viewportY: mirror.viewportY,
  };
}

export function writeToMirror(tabId: string, data: string): void {
  if (!data) {
    return;
  }

  const mirror = ensureMirror(tabId);
  const next = applyTerminalChunk(mirror.replayText, mirror.pendingControl, mirror.pendingCarriageReturn, data);
  mirror.replayText = next.replayText;
  mirror.exportText = trimTrailingBlankLines(next.replayText);
  mirror.pendingControl = next.pendingControl;
  mirror.pendingCarriageReturn = next.pendingCarriageReturn;
  mirror.controller?.writeDirect(data);
}

export function attachMirrorController(tabId: string, controller: TerminalController): void {
  const mirror = ensureMirror(tabId);
  mirror.controller = controller;
  if (mirror.replayText.length > 0) {
    controller.writeDirect(mirror.replayText);
  }
}

export function detachMirrorController(tabId: string): void {
  const mirror = mirrors.get(tabId);
  if (mirror) {
    delete mirror.controller;
  }
}

export function updateMirrorViewport(tabId: string, viewportY: number): void {
  ensureMirror(tabId).viewportY = Math.max(0, Math.floor(viewportY));
}

export function exportMirrorText(tabId: string): string | null {
  const mirror = mirrors.get(tabId);
  if (!mirror || mirror.exportText.length === 0) {
    return null;
  }

  return mirror.exportText;
}

export function resetMirror(tabId: string): void {
  const controller = mirrors.get(tabId)?.controller;
  mirrors.set(tabId, {
    ...createMirrorState(),
    controller,
  });
  controller?.clear?.();
}

export function removeMirror(tabId: string): void {
  mirrors.delete(tabId);
}

export function clearMirrors(): void {
  mirrors.clear();
}

function ensureMirror(tabId: string): TerminalMirrorState {
  const existing = mirrors.get(tabId);
  if (existing) {
    return existing;
  }

  const created = createMirrorState();
  mirrors.set(tabId, created);
  return created;
}

function createMirrorState(): TerminalMirrorState {
  return {
    ...createMirrorSnapshot(),
    pendingControl: "",
    pendingCarriageReturn: false,
  };
}

function applyTerminalChunk(
  replayText: string,
  pendingControl: string,
  pendingCarriageReturn: boolean,
  chunk: string,
): { replayText: string; pendingControl: string; pendingCarriageReturn: boolean } {
  const source = `${pendingControl}${chunk}`;
  let cursor = 0;
  let nextReplay = replayText;
  let carry = pendingCarriageReturn;

  while (cursor < source.length) {
    const escapeIndex = source.indexOf(ESC, cursor);
    if (escapeIndex === -1) {
      const appended = appendPlainText(nextReplay, source.slice(cursor), carry);
      return {
        replayText: appended.output,
        pendingControl: "",
        pendingCarriageReturn: appended.pendingCarriageReturn,
      };
    }

    const appended = appendPlainText(nextReplay, source.slice(cursor, escapeIndex), carry);
    nextReplay = appended.output;
    carry = appended.pendingCarriageReturn;

    const sequence = consumeEscapeSequence(source, escapeIndex);
    if (!sequence) {
      return {
        replayText: nextReplay,
        pendingControl: source.slice(escapeIndex),
        pendingCarriageReturn: carry,
      };
    }

    cursor = sequence.end;
  }

  return {
    replayText: nextReplay,
    pendingControl: "",
    pendingCarriageReturn: carry,
  };
}

function appendPlainText(
  output: string,
  chunk: string,
  pendingCarriageReturn: boolean,
): { output: string; pendingCarriageReturn: boolean } {
  let next = output;
  let carry = pendingCarriageReturn;

  for (const char of chunk) {
    if (carry) {
      if (char === "\n") {
        next += "\n";
        carry = false;
        continue;
      }

      next = clearCurrentLine(next);
      carry = false;
    }

    if (char === "\b") {
      next = removeLastVisibleCharacter(next);
      continue;
    }

    if (char === "\r") {
      carry = true;
      continue;
    }

    next += char;
  }

  return {
    output: next,
    pendingCarriageReturn: carry,
  };
}

function clearCurrentLine(output: string): string {
  const lastNewlineIndex = output.lastIndexOf("\n");
  if (lastNewlineIndex === -1) {
    return "";
  }

  return output.slice(0, lastNewlineIndex + 1);
}

function removeLastVisibleCharacter(output: string): string {
  const codepoints = Array.from(output);
  if (codepoints.length === 0) {
    return output;
  }

  codepoints.pop();
  return codepoints.join("");
}

function consumeEscapeSequence(source: string, fromIndex: number): { end: number } | null {
  const introducer = source[fromIndex + 1];
  if (!introducer) {
    return null;
  }

  if (introducer === "[") {
    return consumeCsiSequence(source, fromIndex);
  }

  if (introducer === "]") {
    return consumeOscSequence(source, fromIndex);
  }

  if (/@|[A-Z]|\\|\]|\^|_|`|[a-z]/.test(introducer)) {
    return {
      end: fromIndex + 2,
    };
  }

  return {
    end: fromIndex + 1,
  };
}

function consumeCsiSequence(source: string, fromIndex: number): { end: number } | null {
  for (let index = fromIndex + 2; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return {
        end: index + 1,
      };
    }
  }

  return null;
}

function consumeOscSequence(source: string, fromIndex: number): { end: number } | null {
  for (let index = fromIndex + 2; index < source.length; index += 1) {
    const char = source[index];
    if (char === BEL) {
      return {
        end: index + 1,
      };
    }

    if (char === ESC) {
      if (source[index + 1] === "\\") {
        return {
          end: index + 2,
        };
      }

      return null;
    }
  }

  return null;
}

function trimTrailingBlankLines(value: string): string {
  return value.replace(/\r\n/gu, "\n").replace(/\n+$/gu, "");
}
