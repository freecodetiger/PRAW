export interface TerminalBufferSnapshot {
  content: string;
  revision: number;
}

export const EMPTY_TERMINAL_BUFFER: TerminalBufferSnapshot = {
  content: "",
  revision: 0,
};

const DEFAULT_MAX_BUFFER_CHARS = 200_000;

export function appendTerminalBuffer(
  snapshot: TerminalBufferSnapshot,
  chunk: string,
  maxChars = DEFAULT_MAX_BUFFER_CHARS,
): TerminalBufferSnapshot {
  if (chunk.length === 0) {
    return snapshot;
  }

  const nextContent = `${snapshot.content}${chunk}`;
  const safeMaxChars = Math.max(1, Math.floor(maxChars));

  return {
    content:
      nextContent.length > safeMaxChars ? nextContent.slice(nextContent.length - safeMaxChars) : nextContent,
    revision: snapshot.revision + 1,
  };
}

export function resetTerminalBuffer(snapshot: TerminalBufferSnapshot): TerminalBufferSnapshot {
  return {
    content: "",
    revision: snapshot.revision + 1,
  };
}
