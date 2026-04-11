export interface SessionTabRef {
  tabId: string;
}

export function resolveSessionTabRef(
  sessionId: string,
  attachedSessions: Map<string, SessionTabRef>,
  pendingSessions: Map<string, SessionTabRef>,
): SessionTabRef | null {
  return attachedSessions.get(sessionId) ?? pendingSessions.get(sessionId) ?? null;
}
