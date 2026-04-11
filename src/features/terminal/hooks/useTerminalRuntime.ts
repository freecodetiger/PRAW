import { useEffect, useMemo, useRef } from "react";

import { closeTerminalSession, createTerminalSession, onTerminalExit, onTerminalOutput } from "../../../lib/tauri/terminal";
import { getTerminalBufferKey, useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { resolveSessionPaneRef, type SessionPaneRef } from "./runtime-session-routing";

function asMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function useTerminalRuntime() {
  const windowModel = useWorkspaceStore((state) => state.window);
  const attachSession = useWorkspaceStore((state) => state.attachSession);
  const markPaneExited = useWorkspaceStore((state) => state.markPaneExited);
  const markPaneError = useWorkspaceStore((state) => state.markPaneError);
  const appendOutput = useTerminalViewStore((state) => state.appendOutput);
  const consumeOutput = useTerminalViewStore((state) => state.consumeOutput);
  const resetPaneBuffer = useTerminalViewStore((state) => state.resetPaneBuffer);
  const removePaneBuffer = useTerminalViewStore((state) => state.removePaneBuffer);
  const syncPaneState = useTerminalViewStore((state) => state.syncPaneState);
  const resetPaneState = useTerminalViewStore((state) => state.resetPaneState);
  const removePaneState = useTerminalViewStore((state) => state.removePaneState);
  const pendingSessionIdsRef = useRef(new Map<string, string>());
  const pendingSessionRefsRef = useRef(new Map<string, SessionPaneRef>());
  const previousSessionIdsRef = useRef(new Set<string>());
  const previousPaneKeysRef = useRef(new Set<string>());
  const windowRef = useRef(windowModel);

  windowRef.current = windowModel;

  const panes = useMemo(() => {
    if (!windowModel) {
      return [];
    }

    return windowModel.tabOrder.flatMap((tabId) => {
      const tab = windowModel.tabs[tabId];
      return Object.values(tab.workspace.panes).map((pane) => ({
        tabId,
        pane,
      }));
    });
  }, [windowModel]);

  const sessionIndex = useMemo(() => {
    const index = new Map<string, { tabId: string; paneId: string }>();

    for (const { tabId, pane } of panes) {
      if (pane.sessionId) {
        index.set(pane.sessionId, {
          tabId,
          paneId: pane.paneId,
        });
      }
    }

    return index;
  }, [panes]);
  const sessionIndexRef = useRef(sessionIndex);
  sessionIndexRef.current = sessionIndex;

  useEffect(() => {
    for (const { tabId, pane } of panes) {
      syncPaneState(tabId, pane.paneId, pane.shell, pane.cwd);
    }
  }, [panes, syncPaneState]);

  useEffect(() => {
    for (const { tabId, pane } of panes) {
      const pendingKey = `${tabId}:${pane.paneId}`;
      if (pane.sessionId || pane.status !== "starting" || pendingSessionIdsRef.current.has(pendingKey)) {
        continue;
      }

      const requestedSessionId = crypto.randomUUID();
      resetPaneBuffer(tabId, pane.paneId);
      resetPaneState(tabId, pane.paneId, pane.shell, pane.cwd);
      pendingSessionIdsRef.current.set(pendingKey, requestedSessionId);
      pendingSessionRefsRef.current.set(requestedSessionId, {
        tabId,
        paneId: pane.paneId,
      });

      void createTerminalSession({
        sessionId: requestedSessionId,
        shell: pane.shell,
        cwd: pane.cwd,
        env: {
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      })
        .then((response) => {
          pendingSessionIdsRef.current.delete(pendingKey);
          pendingSessionRefsRef.current.delete(response.sessionId);

          const currentWindow = windowRef.current;
          const currentPane = currentWindow?.tabs[tabId]?.workspace.panes[pane.paneId];
          if (!currentPane || currentPane.sessionId || currentPane.status !== "starting") {
            return closeTerminalSession(response.sessionId).catch(() => undefined);
          }

          attachSession(tabId, pane.paneId, response.sessionId, response.shell, response.cwd);
        })
        .catch((error) => {
          pendingSessionIdsRef.current.delete(pendingKey);
          pendingSessionRefsRef.current.delete(requestedSessionId);
          markPaneError(tabId, pane.paneId, asMessage(error));
        });
    }
  }, [attachSession, markPaneError, panes, resetPaneBuffer, resetPaneState]);

  useEffect(() => {
    let disposed = false;
    let unlistenExit: (() => void) | undefined;

    void onTerminalExit((event) => {
      const currentWindow = windowRef.current;
      if (!currentWindow) {
        return;
      }

      for (const tabId of currentWindow.tabOrder) {
        const tab = currentWindow.tabs[tabId];
        for (const pane of Object.values(tab.workspace.panes)) {
          if (pane.sessionId === event.sessionId) {
            markPaneExited(tabId, pane.paneId, event.exitCode, event.signal, event.error);
            return;
          }
        }
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlistenExit = cleanup;
    });

    return () => {
      disposed = true;
      unlistenExit?.();
    };
  }, [markPaneExited]);

  useEffect(() => {
    let disposed = false;
    let unlistenOutput: (() => void) | undefined;

    void onTerminalOutput((event) => {
      const paneRef = resolveSessionPaneRef(
        event.sessionId,
        sessionIndexRef.current,
        pendingSessionRefsRef.current,
      );
      if (!paneRef) {
        return;
      }

      appendOutput(paneRef.tabId, paneRef.paneId, event.data);
      consumeOutput(paneRef.tabId, paneRef.paneId, event.data);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlistenOutput = cleanup;
    });

    return () => {
      disposed = true;
      unlistenOutput?.();
    };
  }, [appendOutput, consumeOutput]);

  useEffect(() => {
    const currentSessionIds = new Set<string>();
    for (const { pane } of panes) {
      if (pane.sessionId) {
        currentSessionIds.add(pane.sessionId);
      }
    }

    for (const previousSessionId of previousSessionIdsRef.current) {
      if (!currentSessionIds.has(previousSessionId)) {
        void closeTerminalSession(previousSessionId).catch(() => undefined);
      }
    }

    previousSessionIdsRef.current = currentSessionIds;
  }, [panes]);

  useEffect(() => {
    const activePaneKeys = new Set(panes.map(({ tabId, pane }) => `${tabId}:${pane.paneId}`));

    for (const [sessionId, paneRef] of pendingSessionRefsRef.current) {
      if (!activePaneKeys.has(`${paneRef.tabId}:${paneRef.paneId}`)) {
        pendingSessionRefsRef.current.delete(sessionId);
      }
    }
  }, [panes]);

  useEffect(() => {
    const currentPaneKeys = new Set(panes.map(({ tabId, pane }) => getTerminalBufferKey(tabId, pane.paneId)));

    for (const previousPaneKey of previousPaneKeysRef.current) {
      if (currentPaneKeys.has(previousPaneKey)) {
        continue;
      }

      const separatorIndex = previousPaneKey.indexOf(":pane:");
      if (separatorIndex === -1) {
        continue;
      }

      removePaneBuffer(previousPaneKey.slice(0, separatorIndex), previousPaneKey.slice(separatorIndex + 1));
      removePaneState(previousPaneKey.slice(0, separatorIndex), previousPaneKey.slice(separatorIndex + 1));
    }

    previousPaneKeysRef.current = currentPaneKeys;
  }, [panes, removePaneBuffer, removePaneState]);
}
