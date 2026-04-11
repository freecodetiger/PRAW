import type { LayoutNode } from "../layout/types";
import type { TerminalSessionStatus } from "../terminal/types";

export interface TabModel {
  tabId: string;
  title: string;
  note?: string;
  shell: string;
  cwd: string;
  status: TerminalSessionStatus;
  sessionId?: string;
  error?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface WindowModel {
  layout: LayoutNode;
  tabs: Record<string, TabModel>;
  activeTabId: string;
  nextTabNumber: number;
}
