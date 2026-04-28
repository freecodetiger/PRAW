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
  selectTerminalTabState,
  useTerminalViewStore,
} from "../state/terminal-view-store";
import { selectAllWorkspaceTabs, useWorkspaceStore } from "../state/workspace-store";
import { resolveSessionTabRef, type SessionTabRef } from "./runtime-session-routing";
import { flushDirect, hardResetTerminalRuntime, writeDirect, writeDirectBuffered } from "../lib/terminal-registry";

const SHELL_COMMAND_START_MARKER_PREFIX = "\u001b]133;C";
const SHELL_MARKER_BEL = "\u0007";
const SHELL_MARKER_ST = "\u001b\\";

function stripAgentWorkflowEntryPrefix(data: string, commandEntry: string | undefined): { data: string; matched: boolean } {
  let cursor = 0;

  while (cursor < data.length) {
    const markerStart = data.indexOf(SHELL_COMMAND_START_MARKER_PREFIX, cursor);
    if (markerStart === -1) {
      return { data, matched: false };
    }

    const markerEnd = findShellMarkerEnd(data, markerStart + SHELL_COMMAND_START_MARKER_PREFIX.length);
    if (!markerEnd) {
      return { data, matched: false };
    }

    const payload = data.slice(markerStart + "\u001b]133;".length, markerEnd.index);
    if (isMatchingAgentWorkflowCommandMarker(payload, commandEntry)) {
      return {
        data: data.slice(markerEnd.index + markerEnd.length),
        matched: true,
      };
    }

    cursor = markerEnd.index + markerEnd.length;
  }

  return { data, matched: false };
}

function findShellMarkerEnd(data: string, fromIndex: number): { index: number; length: number } | null {
  const belIndex = data.indexOf(SHELL_MARKER_BEL, fromIndex);
  const stIndex = data.indexOf(SHELL_MARKER_ST, fromIndex);

  if (belIndex === -1 && stIndex === -1) {
    return null;
  }

  if (belIndex === -1) {
    return { index: stIndex, length: SHELL_MARKER_ST.length };
  }

  if (stIndex === -1 || belIndex < stIndex) {
    return { index: belIndex, length: SHELL_MARKER_BEL.length };
  }

  return { index: stIndex, length: SHELL_MARKER_ST.length };
}

function isMatchingAgentWorkflowCommandMarker(payload: string, commandEntry: string | undefined): boolean {
  if (payload === "C") {
    return commandEntry === undefined;
  }

  if (!payload.startsWith("C;entry=")) {
    return false;
  }

  if (commandEntry === undefined) {
    return true;
  }

  return payload.slice("C;entry=".length) === commandEntry;
}

function extractAgentWorkflowStartupFrame(data: string): { commandEntry?: string; data: string } | null {
  let cursor = 0;
  let commandEntry: string | undefined;

  while (cursor < data.length) {
    const markerStart = data.indexOf("\u001b]133;", cursor);
    if (markerStart === -1) {
      return null;
    }

    const markerEnd = findShellMarkerEnd(data, markerStart + "\u001b]133;".length);
    if (!markerEnd) {
      return null;
    }

    const payload = data.slice(markerStart + "\u001b]133;".length, markerEnd.index);
    if (payload === "C") {
      commandEntry = undefined;
    } else if (payload.startsWith("C;entry=")) {
      commandEntry = payload.slice("C;entry=".length);
    } else if (payload.startsWith("PRAW_AGENT;provider=")) {
      return {
        commandEntry,
        data: data.slice(markerEnd.index + markerEnd.length),
      };
    }

    cursor = markerEnd.index + markerEnd.length;
  }

  return null;
}

function asMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function containsCommandEndMarker(data: string): boolean {
  return data.includes("\u001b]133;D");
}

export function useTerminalRuntime() {
  const preferredMode = useAppConfigStore((state) => state.config.terminal.preferredMode);
  const workspaceCollection = useWorkspaceStore((state) => state.workspaceCollection);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
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
  const pendingAgentWorkflowEntryCutsRef = useRef(new Map<string, string | undefined>());
  const tabs = useMemo(
    () =>
      selectAllWorkspaceTabs({
        workspaceCollection,
        activeWorkspaceId,
        window: windowModel,
      }),
    [activeWorkspaceId, windowModel, workspaceCollection],
  );
  const tabsByIdRef = useRef(new Map(tabs.map((tab) => [tab.tabId, tab])));
  tabsByIdRef.current = new Map(tabs.map((tab) => [tab.tabId, tab]));

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

          const currentTab = tabsByIdRef.current.get(tab.tabId);
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

      let directOutput = event.data;
      const existingTabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, tabRef.tabId);
      const isAgentWorkflowOutput = existingTabState?.presentation === "agent-workflow";
      const startupFrame =
        !isAgentWorkflowOutput ? extractAgentWorkflowStartupFrame(event.data) : null;
      if (startupFrame && existingTabState?.presentation !== "agent-workflow") {
        hardResetTerminalRuntime(tabRef.tabId);
        consumeSemantic(tabRef.tabId, {
          sessionId: event.sessionId,
          kind: "agent-workflow",
          reason: "shell-entry",
          confidence: "strong",
          commandEntry: startupFrame.commandEntry,
        });
        directOutput = startupFrame.data;
        pendingAgentWorkflowEntryCutsRef.current.delete(tabRef.tabId);
      }
      const shouldBufferAgentWorkflowOutput = isAgentWorkflowOutput || Boolean(startupFrame);

      if (pendingAgentWorkflowEntryCutsRef.current.has(tabRef.tabId)) {
        const commandEntry = pendingAgentWorkflowEntryCutsRef.current.get(tabRef.tabId);
        const stripped = stripAgentWorkflowEntryPrefix(event.data, commandEntry);
        directOutput = stripped.data;
        pendingAgentWorkflowEntryCutsRef.current.delete(tabRef.tabId);
      }

      if (directOutput) {
        if (shouldBufferAgentWorkflowOutput) {
          writeDirectBuffered(tabRef.tabId, directOutput);
          if (containsCommandEndMarker(event.data)) {
            flushDirect(tabRef.tabId);
          }
        } else {
          writeDirect(tabRef.tabId, directOutput);
        }
      }

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

      const existingTabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, tabRef.tabId);
      if (event.kind === "agent-workflow" && existingTabState?.presentation !== "agent-workflow") {
        hardResetTerminalRuntime(tabRef.tabId);
        pendingAgentWorkflowEntryCutsRef.current.set(tabRef.tabId, event.commandEntry);
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
