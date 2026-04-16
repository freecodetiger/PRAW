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
  writeToMirror(tabId, data);
}

export function updateViewport(tabId: string, viewportY: number): void {
  updateMirrorViewport(tabId, viewportY);
}

export function resetDirect(tabId: string): void {
  resetMirror(tabId);
}

export function removeDirect(tabId: string): void {
  registry.delete(tabId);
  removeMirror(tabId);
}

export function clearRegistry(): void {
  registry.clear();
  clearMirrors();
}
