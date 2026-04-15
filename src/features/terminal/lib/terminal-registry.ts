/**
 * Terminal Registry
 * 
 * 全局注册表：tabId → terminal controller 映射
 * 
 * 目的：让 PTY 输出可以直接写入 xterm，绕过 React 状态同步，彻底消除频闪
 */
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
}

const registry = new Map<string, TerminalController>();
const snapshots = new Map<string, TerminalSnapshot>();

/**
 * 注册终端实例
 */
export function registerTerminal(tabId: string, terminal: TerminalController): void {
  registry.set(tabId, terminal);
}

/**
 * 注销终端实例
 */
export function unregisterTerminal(tabId: string): void {
  registry.delete(tabId);
}

/**
 * 获取终端实例
 */
export function getTerminal(tabId: string): TerminalController | undefined {
  return registry.get(tabId);
}

export function getTerminalSnapshot(tabId: string): TerminalSnapshot {
  return snapshots.get(tabId) ?? EMPTY_TERMINAL_SNAPSHOT;
}

/**
 * 检查终端是否已注册
 */
export function hasTerminal(tabId: string): boolean {
  return registry.has(tabId);
}

/**
 * 直接向指定终端写入数据
 * 绕过 React 状态，零渲染开销
 */
export function writeDirect(tabId: string, data: string): void {
  if (!data) {
    return;
  }

  const snapshot = ensureSnapshot(tabId);
  snapshot.content += data;

  const terminal = registry.get(tabId);
  if (terminal) {
    terminal.writeDirect(data);
  }
}

export function updateViewport(tabId: string, viewportY: number): void {
  const snapshot = ensureSnapshot(tabId);
  snapshot.viewportY = Math.max(0, Math.floor(viewportY));
}

/**
 * 清空指定终端
 */
export function resetDirect(tabId: string): void {
  snapshots.set(tabId, {
    ...EMPTY_TERMINAL_SNAPSHOT,
  });
  registry.get(tabId)?.clear?.();
}

export function removeDirect(tabId: string): void {
  snapshots.delete(tabId);
}

/**
 * 清空所有注册（用于热重载或测试）
 */
export function clearRegistry(): void {
  registry.clear();
  snapshots.clear();
}

function ensureSnapshot(tabId: string): TerminalSnapshot {
  const existing = snapshots.get(tabId);
  if (existing) {
    return existing;
  }

  const snapshot = {
    ...EMPTY_TERMINAL_SNAPSHOT,
  };
  snapshots.set(tabId, snapshot);
  return snapshot;
}

const EMPTY_TERMINAL_SNAPSHOT: TerminalSnapshot = {
  content: "",
  viewportY: 0,
};
