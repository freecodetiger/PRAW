import type { TerminalController } from "./terminal-registry";

export interface TerminalMirrorSnapshot {
  replayText: string;
  exportText: string;
  viewportY: number;
}

interface TerminalMirrorState extends TerminalMirrorSnapshot {
  controller?: TerminalController;
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
  mirror.replayText += data;
  mirror.exportText = normalizeMirrorExport(mirror.replayText);
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
  mirrors.set(tabId, { ...createMirrorSnapshot(), controller });
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

  const created: TerminalMirrorState = createMirrorSnapshot();
  mirrors.set(tabId, created);
  return created;
}

function normalizeMirrorExport(replayText: string): string {
  return replayText.replace(/\r\n/gu, "\n").replace(/\r/gu, "").replace(/\n+$/gu, "");
}
