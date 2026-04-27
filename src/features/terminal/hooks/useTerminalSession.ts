import { useMemo, useRef } from "react";

import { closeTerminalSession, resizeTerminalSession, writeTerminalSession } from "../../../lib/tauri/terminal";
import { useWorkspaceStore } from "../state/workspace-store";

export function useTerminalSession(tabId: string) {
  const tab = useWorkspaceStore((state) => state.window?.tabs[tabId]);
  const restartTab = useWorkspaceStore((state) => state.restartTab);
  const activeSessionIdRef = useRef<string | undefined>(undefined);
  activeSessionIdRef.current = tab?.sessionId;

  const controls = useMemo(
    () => ({
      async write(data: string) {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) {
          return;
        }

        await writeTerminalSession(sessionId, data);
      },

      async resize(cols: number, rows: number) {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) {
          return;
        }

        await resizeTerminalSession(sessionId, cols, rows);
      },

      async terminate() {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) {
          return;
        }

        await closeTerminalSession(sessionId).catch(() => undefined);
      },

      async restart() {
        const sessionId = activeSessionIdRef.current;
        if (sessionId) {
          await closeTerminalSession(sessionId).catch(() => undefined);
        }

        restartTab(tabId);
      },
    }),
    [restartTab, tabId],
  );

  return {
    tab,
    currentStreamSessionId: tab?.sessionId ?? null,
    ...controls,
  };
}
