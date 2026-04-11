import type { ShellLifecycleEvent } from "../../../domain/terminal/dialog";

const MARKER_PREFIX = "\u001b]133;";
const MARKER_SUFFIX = "\u0007";
const MARKER_SUFFIX_ST = "\u001b\\";

export interface ShellIntegrationParserState {
  pending: string;
  suppressPrompt: boolean;
}

export interface ShellIntegrationChunkResult {
  state: ShellIntegrationParserState;
  visibleOutput: string;
  events: ShellLifecycleEvent[];
}

export function createShellIntegrationParserState(): ShellIntegrationParserState {
  return {
    pending: "",
    suppressPrompt: false,
  };
}

export function consumeShellIntegrationChunk(
  state: ShellIntegrationParserState,
  chunk: string,
): ShellIntegrationChunkResult {
  const source = `${state.pending}${chunk}`;
  let cursor = 0;
  let visibleOutput = "";
  const events: ShellLifecycleEvent[] = [];
  let suppressPrompt = state.suppressPrompt;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(MARKER_PREFIX, cursor);
    if (markerIndex === -1) {
      if (!suppressPrompt) {
        visibleOutput += source.slice(cursor);
      }
      return {
        state: {
          pending: "",
          suppressPrompt,
        },
        visibleOutput,
        events,
      };
    }

    if (!suppressPrompt) {
      visibleOutput += source.slice(cursor, markerIndex);
    }

    const markerEnd = findMarkerEnd(source, markerIndex + MARKER_PREFIX.length);
    if (!markerEnd) {
      return {
        state: {
          pending: source.slice(markerIndex),
          suppressPrompt,
        },
        visibleOutput,
        events,
      };
    }

    const payload = source.slice(markerIndex + MARKER_PREFIX.length, markerEnd.index);
    const marker = parseShellMarkerPayload(payload);
    if (marker?.type === "prompt-start") {
      suppressPrompt = true;
    } else if (marker?.type === "prompt-end") {
      suppressPrompt = false;
    }

    const event =
      marker?.type === "command-start" ||
      marker?.type === "command-end" ||
      marker?.type === "prompt-state"
        ? marker
        : null;
    if (event) {
      events.push(event);
    } else {
      if (!suppressPrompt && marker === null) {
        visibleOutput += source.slice(markerIndex, markerEnd.index + markerEnd.length);
      }
    }

    cursor = markerEnd.index + markerEnd.length;
  }

  return {
    state: {
      pending: "",
      suppressPrompt,
    },
    visibleOutput,
    events,
  };
}

function findMarkerEnd(source: string, fromIndex: number): { index: number; length: number } | null {
  const belIndex = source.indexOf(MARKER_SUFFIX, fromIndex);
  const stIndex = source.indexOf(MARKER_SUFFIX_ST, fromIndex);

  if (belIndex === -1 && stIndex === -1) {
    return null;
  }

  if (belIndex === -1) {
    return {
      index: stIndex,
      length: MARKER_SUFFIX_ST.length,
    };
  }

  if (stIndex === -1 || belIndex < stIndex) {
    return {
      index: belIndex,
      length: MARKER_SUFFIX.length,
    };
  }

  return {
    index: stIndex,
    length: MARKER_SUFFIX_ST.length,
  };
}

function parseShellMarkerPayload(payload: string):
  | ShellLifecycleEvent
  | { type: "prompt-start" }
  | { type: "prompt-end" }
  | null {
  if (payload === "A") {
    return { type: "prompt-start" };
  }

  if (payload === "B") {
    return { type: "prompt-end" };
  }

  if (payload === "C") {
    return { type: "command-start" };
  }

  if (payload.startsWith("D;")) {
    const exitCode = Number(payload.slice(2));
    if (Number.isFinite(exitCode)) {
      return { type: "command-end", exitCode };
    }
    return null;
  }

  if (payload.startsWith("P;cwd=")) {
    return {
      type: "prompt-state",
      cwd: payload.slice("P;cwd=".length),
    };
  }

  return null;
}
