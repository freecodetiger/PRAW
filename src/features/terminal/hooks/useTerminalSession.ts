import { useEffect, useMemo, useRef } from "react";

import { closeTerminalSession, resizeTerminalSession, writeTerminalSession } from "../../../lib/tauri/terminal";
import { useWorkspaceStore } from "../state/workspace-store";

export function useTerminalSession(tabId: string, paneId: string) {
  const pane = useWorkspaceStore((state) => state.window?.tabs[tabId]?.workspace.panes[paneId]);
  const restartPane = useWorkspaceStore((state) => state.restartPane);
  const activeSessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeSessionIdRef.current = pane?.sessionId;
  }, [pane?.sessionId]);

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

      async restart() {
        const sessionId = activeSessionIdRef.current;
        if (sessionId) {
          await closeTerminalSession(sessionId).catch(() => undefined);
        }

        restartPane(tabId, paneId);
      },
    }),
    [paneId, restartPane, tabId],
  );

  return {
    pane,
    currentStreamSessionId: pane?.sessionId ?? null,
    ...controls,
  };
}
