/**
 * Terminal Registry
 * 
 * 全局注册表：tabId → xterm Terminal 实例映射
 * 
 * 目的：让 PTY 输出可以直接写入 xterm，绕过 React 状态同步，彻底消除频闪
 */

import type { Terminal } from "@xterm/xterm";

const registry = new Map<string, Terminal>();

/**
 * 注册终端实例
 */
export function registerTerminal(tabId: string, terminal: Terminal): void {
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
export function getTerminal(tabId: string): Terminal | undefined {
  return registry.get(tabId);
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
  const terminal = registry.get(tabId);
  if (terminal) {
    terminal.write(data);
  }
}

/**
 * 清空指定终端
 */
export function resetDirect(tabId: string): void {
  const terminal = registry.get(tabId);
  if (terminal) {
    terminal.reset();
  }
}

/**
 * 清空所有注册（用于热重载或测试）
 */
export function clearRegistry(): void {
  registry.clear();
}
