/**
 * Terminal Registry
 *
 * 全局注册表：tabId → terminal controller 映射
 *
 * 目的：让 PTY 输出可以直接写入 xterm，绕过 React 状态同步，彻底消除频闪
 */
import {
  attachMirrorController,
  clearMirrors,
  detachMirrorController,
  exportMirrorText,
  getMirrorSnapshot,
  removeMirror,
  resetMirror,
  updateMirrorViewport,
  writeToMirror,
} from "./terminal-screen-mirror";
import { clearPersistentTerminalRuntimes, disposePersistentTerminalRuntime, hardResetPersistentTerminalRuntime } from "./persistent-terminal-runtime";

const DIRECT_WRITE_FLUSH_DELAY_MS = 16;

export interface TerminalController {
  writeDirect: (data: string) => void;
  pasteText: (text: string) => void;
  sendEnter: () => Promise<void> | void;
  clear?: () => void;
  focus: () => void;
  blur: () => void;
  hasSelection: () => boolean;
  getSelectionText: () => string;
}

export interface TerminalSnapshot {
  content: string;
  viewportY: number;
  archiveText: string;
}

const registry = new Map<string, TerminalController>();
const pendingDirectWrites = new Map<string, { data: string; timer: ReturnType<typeof setTimeout> | null }>();

export function registerTerminal(tabId: string, terminal: TerminalController): void {
  registry.set(tabId, terminal);
  attachMirrorController(tabId, terminal);
}

export function unregisterTerminal(tabId: string): void {
  registry.delete(tabId);
  detachMirrorController(tabId);
}

export function getTerminal(tabId: string): TerminalController | undefined {
  return registry.get(tabId);
}

export function getTerminalSnapshot(tabId: string): TerminalSnapshot {
  const snapshot = getMirrorSnapshot(tabId);
  return {
    content: snapshot.replayText,
    viewportY: snapshot.viewportY,
    archiveText: snapshot.exportText,
  };
}

export function exportTerminalArchive(tabId: string): string | null {
  return exportMirrorText(tabId);
}

export function hasTerminal(tabId: string): boolean {
  return registry.has(tabId);
}

export function writeDirect(tabId: string, data: string): void {
  flushDirect(tabId);
  writeToMirror(tabId, data);
}

export function writeDirectBuffered(tabId: string, data: string): void {
  if (!data) {
    return;
  }

  const pending = pendingDirectWrites.get(tabId);
  if (pending) {
    pending.data += data;
    return;
  }

  const created = {
    data,
    timer: setTimeout(() => {
      flushDirect(tabId);
    }, DIRECT_WRITE_FLUSH_DELAY_MS),
  };
  pendingDirectWrites.set(tabId, created);
}

export function flushDirect(tabId: string): void {
  const pending = pendingDirectWrites.get(tabId);
  if (!pending) {
    return;
  }

  pendingDirectWrites.delete(tabId);
  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  if (pending.data) {
    writeToMirror(tabId, pending.data);
  }
}

export function updateViewport(tabId: string, viewportY: number): void {
  updateMirrorViewport(tabId, viewportY);
}

export function resetDirect(tabId: string): void {
  clearPendingDirectWrite(tabId);
  resetMirror(tabId);
}

export function hardResetTerminalRuntime(tabId: string): void {
  clearPendingDirectWrite(tabId);
  resetMirror(tabId);
  hardResetPersistentTerminalRuntime(tabId);
}

export function removeDirect(tabId: string): void {
  clearPendingDirectWrite(tabId);
  registry.delete(tabId);
  disposePersistentTerminalRuntime(tabId);
  removeMirror(tabId);
}

export function clearRegistry(): void {
  for (const tabId of pendingDirectWrites.keys()) {
    clearPendingDirectWrite(tabId);
  }
  registry.clear();
  clearPersistentTerminalRuntimes();
  clearMirrors();
}

function clearPendingDirectWrite(tabId: string): void {
  const pending = pendingDirectWrites.get(tabId);
  if (!pending) {
    return;
  }

  pendingDirectWrites.delete(tabId);
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
}
