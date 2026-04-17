import type { ShellLifecycleEvent } from "../../../domain/terminal/dialog";

const ESC = "\u001b";
const BEL = "\u0007";
const MARKER_PREFIX = "\u001b]133;";
const MARKER_SUFFIX = BEL;
const MARKER_SUFFIX_ST = "\u001b\\";

export interface ShellIntegrationParserState {
  pending: string;
  pendingControl: string;
  pendingCarriageReturn: boolean;
  suppressPrompt: boolean;
  shellReady: boolean;
}

export interface ShellIntegrationChunkResult {
  state: ShellIntegrationParserState;
  visibleOutput: string;
  events: ShellLifecycleEvent[];
}

export function createShellIntegrationParserState(): ShellIntegrationParserState {
  return {
    pending: "",
    pendingControl: "",
    pendingCarriageReturn: false,
    suppressPrompt: false,
    shellReady: false,
  };
}

export function consumeShellIntegrationChunk(
  state: ShellIntegrationParserState,
  chunk: string,
): ShellIntegrationChunkResult {
  const source = `${state.pending}${chunk}`;
  let cursor = 0;
  let rawVisibleOutput = "";
  const events: ShellLifecycleEvent[] = [];
  let suppressPrompt = state.suppressPrompt;
  let shellReady = state.shellReady;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(MARKER_PREFIX, cursor);
    if (markerIndex === -1) {
      if (shellReady && !suppressPrompt) {
        rawVisibleOutput += source.slice(cursor);
      }
      return finalizeVisibleOutput(state.pendingControl, state.pendingCarriageReturn, rawVisibleOutput, {
        pending: "",
        suppressPrompt,
        shellReady,
        events,
      });
    }

    if (shellReady && !suppressPrompt) {
      rawVisibleOutput += source.slice(cursor, markerIndex);
    }

    const markerEnd = findMarkerEnd(source, markerIndex + MARKER_PREFIX.length);
    if (!markerEnd) {
      return finalizeVisibleOutput(state.pendingControl, state.pendingCarriageReturn, rawVisibleOutput, {
        pending: source.slice(markerIndex),
        suppressPrompt,
        shellReady,
        events,
      });
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
      if (event.type === "prompt-state") {
        shellReady = true;
      }
      events.push(event);
    } else if (shellReady && !suppressPrompt && marker === null) {
      rawVisibleOutput += source.slice(markerIndex, markerEnd.index + markerEnd.length);
    }

    cursor = markerEnd.index + markerEnd.length;
  }

  return finalizeVisibleOutput(state.pendingControl, state.pendingCarriageReturn, rawVisibleOutput, {
    pending: "",
    suppressPrompt,
    shellReady,
    events,
  });
}

function finalizeVisibleOutput(
  pendingControl: string,
  pendingCarriageReturn: boolean,
  rawVisibleOutput: string,
  result: {
    pending: string;
    suppressPrompt: boolean;
    shellReady: boolean;
    events: ShellLifecycleEvent[];
  },
): ShellIntegrationChunkResult {
  const sanitized = sanitizeVisibleTerminalOutput(pendingControl, pendingCarriageReturn, rawVisibleOutput);

  return {
    state: {
      pending: result.pending,
      pendingControl: sanitized.pendingControl,
      pendingCarriageReturn: sanitized.pendingCarriageReturn,
      suppressPrompt: result.suppressPrompt,
      shellReady: result.shellReady,
    },
    visibleOutput: sanitized.visibleOutput,
    events: result.events,
  };
}

function sanitizeVisibleTerminalOutput(
  pendingControl: string,
  pendingCarriageReturn: boolean,
  chunk: string,
): { visibleOutput: string; pendingControl: string; pendingCarriageReturn: boolean } {
  const source = `${pendingControl}${chunk}`;
  let cursor = 0;
  let visibleOutput = "";
  let carry = pendingCarriageReturn;

  while (cursor < source.length) {
    const escapeIndex = source.indexOf(ESC, cursor);
    if (escapeIndex === -1) {
      const appended = appendPlainText(visibleOutput, source.slice(cursor), carry);
      visibleOutput = appended.output;
      return {
        visibleOutput,
        pendingControl: "",
        pendingCarriageReturn: appended.pendingCarriageReturn,
      };
    }

    const appended = appendPlainText(visibleOutput, source.slice(cursor, escapeIndex), carry);
    visibleOutput = appended.output;
    carry = appended.pendingCarriageReturn;
    const sequence = consumeEscapeSequence(source, escapeIndex);
    if (!sequence) {
      return {
        visibleOutput,
        pendingControl: source.slice(escapeIndex),
        pendingCarriageReturn: carry,
      };
    }

    if (sequence.preserve) {
      visibleOutput += source.slice(escapeIndex, sequence.end);
    }

    cursor = sequence.end;
  }

  return {
    visibleOutput,
    pendingControl: "",
    pendingCarriageReturn: carry,
  };
}

function appendPlainText(
  output: string,
  chunk: string,
  pendingCarriageReturn: boolean,
): { output: string; pendingCarriageReturn: boolean } {
  let next = output;
  let carry = pendingCarriageReturn;

  for (const char of chunk) {
    if (carry) {
      if (char === "\n") {
        next += "\n";
        carry = false;
        continue;
      }

      next = clearCurrentLine(next);
      carry = false;
    }

    if (char === "\b") {
      next = removeLastVisibleCharacter(next);
      continue;
    }

    if (char === "\r") {
      carry = true;
      continue;
    }

    next += char;
  }

  return {
    output: next,
    pendingCarriageReturn: carry,
  };
}

function removeLastVisibleCharacter(output: string): string {
  const trailingAnsiMatch = output.match(/(?:\u001b\[[0-9;]*m)+$/u);
  const trailingAnsi = trailingAnsiMatch?.[0] ?? "";
  const visiblePrefix = trailingAnsi.length > 0 ? output.slice(0, -trailingAnsi.length) : output;
  const codepoints = Array.from(visiblePrefix);

  if (codepoints.length === 0) {
    return output;
  }

  codepoints.pop();
  return `${codepoints.join("")}${trailingAnsi}`;
}

function clearCurrentLine(output: string): string {
  const lastNewlineIndex = output.lastIndexOf("\n");
  if (lastNewlineIndex === -1) {
    return "";
  }

  return output.slice(0, lastNewlineIndex + 1);
}

function consumeEscapeSequence(
  source: string,
  fromIndex: number,
): { end: number; preserve: boolean } | null {
  const introducer = source[fromIndex + 1];
  if (!introducer) {
    return null;
  }

  if (introducer === "[") {
    return consumeCsiSequence(source, fromIndex);
  }

  if (introducer === "]") {
    return consumeOscSequence(source, fromIndex);
  }

  if (/@|[A-Z]|\\|\]|\^|_|`|[a-z]/.test(introducer)) {
    return {
      end: fromIndex + 2,
      preserve: false,
    };
  }

  return {
    end: fromIndex + 1,
    preserve: false,
  };
}

function consumeCsiSequence(source: string, fromIndex: number): { end: number; preserve: boolean } | null {
  for (let index = fromIndex + 2; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return {
        end: index + 1,
        preserve: source[index] === "m",
      };
    }
  }

  return null;
}

function consumeOscSequence(source: string, fromIndex: number): { end: number; preserve: boolean } | null {
  for (let index = fromIndex + 2; index < source.length; index += 1) {
    const char = source[index];
    if (char === BEL) {
      return {
        end: index + 1,
        preserve: false,
      };
    }

    if (char === ESC) {
      if (source[index + 1] === "\\") {
        return {
          end: index + 2,
          preserve: false,
        };
      }

      return null;
    }
  }

  return null;
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

  if (payload.startsWith("C;entry=")) {
    return {
      type: "command-start",
      entry: payload.slice("C;entry=".length),
    };
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
