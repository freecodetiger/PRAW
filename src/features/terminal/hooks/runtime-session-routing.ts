export interface SessionPaneRef {
  tabId: string;
  paneId: string;
}

export function resolveSessionPaneRef(
  sessionId: string,
  attachedSessions: Map<string, SessionPaneRef>,
  pendingSessions: Map<string, SessionPaneRef>,
): SessionPaneRef | null {
  return attachedSessions.get(sessionId) ?? pendingSessions.get(sessionId) ?? null;
}
