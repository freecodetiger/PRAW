import { useEffect, useMemo, useRef } from "react";

import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  closeTerminalSession,
  createTerminalSession,
  onTerminalExit,
  onTerminalOutput,
  onTerminalSemantic,
} from "../../../lib/tauri/terminal";
import {
  getTerminalBufferKey,
  useTerminalViewStore,
} from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { resolveSessionTabRef, type SessionTabRef } from "./runtime-session-routing";
import { writeDirect } from "../lib/terminal-registry";

function asMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function useTerminalRuntime() {
  const preferredMode = useAppConfigStore((state) => state.config.terminal.preferredMode);
  const windowModel = useWorkspaceStore((state) => state.window);
  const attachSession = useWorkspaceStore((state) => state.attachSession);
  const markTabExited = useWorkspaceStore((state) => state.markTabExited);
  const markTabError = useWorkspaceStore((state) => state.markTabError);
  const updateTabCwd = useWorkspaceStore((state) => state.updateTabCwd);
  const consumeOutput = useTerminalViewStore((state) => state.consumeOutput);
  const consumeSemantic = useTerminalViewStore((state) => state.consumeSemantic);
  const resetTabBuffer = useTerminalViewStore((state) => state.resetTabBuffer);
  const removeTabBuffer = useTerminalViewStore((state) => state.removeTabBuffer);
  const syncTabState = useTerminalViewStore((state) => state.syncTabState);
  const resetTabState = useTerminalViewStore((state) => state.resetTabState);
  const removeTabState = useTerminalViewStore((state) => state.removeTabState);
  const pendingSessionIdsRef = useRef(new Map<string, string>());
  const pendingSessionRefsRef = useRef(new Map<string, SessionTabRef>());
  const previousSessionIdsRef = useRef(new Set<string>());
  const previousTabKeysRef = useRef(new Set<string>());
  const windowRef = useRef(windowModel);

  windowRef.current = windowModel;

  const tabs = useMemo(() => {
    if (!windowModel) {
      return [];
    }

    return Object.values(windowModel.tabs);
  }, [windowModel]);

  const sessionIndex = useMemo(() => {
    const index = new Map<string, SessionTabRef>();

    for (const tab of tabs) {
      if (tab.sessionId) {
        index.set(tab.sessionId, {
          tabId: tab.tabId,
        });
      }
    }

    return index;
  }, [tabs]);
  const sessionIndexRef = useRef(sessionIndex);
  sessionIndexRef.current = sessionIndex;

  useEffect(() => {
    for (const tab of tabs) {
      syncTabState(tab.tabId, tab.shell, tab.cwd, preferredMode);
    }
  }, [preferredMode, syncTabState, tabs]);

  useEffect(() => {
    for (const tab of tabs) {
      if (tab.sessionId || tab.status !== "starting" || pendingSessionIdsRef.current.has(tab.tabId)) {
        continue;
      }

      const requestedSessionId = crypto.randomUUID();
      resetTabBuffer(tab.tabId);
      resetTabState(tab.tabId, tab.shell, tab.cwd, preferredMode);
      pendingSessionIdsRef.current.set(tab.tabId, requestedSessionId);
      pendingSessionRefsRef.current.set(requestedSessionId, {
        tabId: tab.tabId,
      });

      void createTerminalSession({
        sessionId: requestedSessionId,
        shell: tab.shell,
        cwd: tab.cwd,
        env: {
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      })
        .then((response) => {
          pendingSessionIdsRef.current.delete(tab.tabId);
          pendingSessionRefsRef.current.delete(response.sessionId);

          const currentWindow = windowRef.current;
          const currentTab = currentWindow?.tabs[tab.tabId];
          if (!currentTab || currentTab.sessionId || currentTab.status !== "starting") {
            return closeTerminalSession(response.sessionId).catch(() => undefined);
          }

          attachSession(tab.tabId, response.sessionId, response.shell, response.cwd);
        })
        .catch((error) => {
          pendingSessionIdsRef.current.delete(tab.tabId);
          pendingSessionRefsRef.current.delete(requestedSessionId);
          markTabError(tab.tabId, asMessage(error));
        });
    }
  }, [attachSession, markTabError, preferredMode, resetTabBuffer, resetTabState, tabs]);

  useEffect(() => {
    let disposed = false;
    let unlistenExit: (() => void) | undefined;

    void onTerminalExit((event) => {
      const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
      if (!tabRef) {
        return;
      }

      markTabExited(tabRef.tabId, event.exitCode, event.signal, event.error);
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
  }, [markTabExited]);

  useEffect(() => {
    let disposed = false;
    let unlistenOutput: (() => void) | undefined;

    void onTerminalOutput((event) => {
      const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
      if (!tabRef) {
        return;
      }

      writeDirect(tabRef.tabId, event.data);

      const promptCwd = consumeOutput(tabRef.tabId, event.data);
      if (promptCwd) {
        updateTabCwd(tabRef.tabId, promptCwd);
      }
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
  }, [consumeOutput, updateTabCwd]);

  useEffect(() => {
    let disposed = false;
    let unlistenSemantic: (() => void) | undefined;

    void onTerminalSemantic((event) => {
      const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
      if (!tabRef) {
        return;
      }

      consumeSemantic(tabRef.tabId, event);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlistenSemantic = cleanup;
    });

    return () => {
      disposed = true;
      unlistenSemantic?.();
    };
  }, [consumeSemantic]);

  useEffect(() => {
    const currentSessionIds = new Set<string>();
    for (const tab of tabs) {
      if (tab.sessionId) {
        currentSessionIds.add(tab.sessionId);
      }
    }

    for (const previousSessionId of previousSessionIdsRef.current) {
      if (!currentSessionIds.has(previousSessionId)) {
        void closeTerminalSession(previousSessionId).catch(() => undefined);
      }
    }

    previousSessionIdsRef.current = currentSessionIds;
  }, [tabs]);

  useEffect(() => {
    const activeTabIds = new Set(tabs.map((tab) => tab.tabId));

    for (const [sessionId, tabRef] of pendingSessionRefsRef.current) {
      if (!activeTabIds.has(tabRef.tabId)) {
        pendingSessionRefsRef.current.delete(sessionId);
      }
    }
  }, [tabs]);

  useEffect(() => {
    const currentTabKeys = new Set(tabs.map((tab) => getTerminalBufferKey(tab.tabId)));

    for (const previousTabKey of previousTabKeysRef.current) {
      if (currentTabKeys.has(previousTabKey)) {
        continue;
      }

      removeTabBuffer(previousTabKey);
      removeTabState(previousTabKey);
    }

    previousTabKeysRef.current = currentTabKeys;
  }, [removeTabBuffer, removeTabState, tabs]);
}
