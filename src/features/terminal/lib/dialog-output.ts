import { highlightOutputText, type HistoryHighlightKind } from "./history-highlighting";

export interface DialogOutputStyle {
  color?: string;
  fontWeight?: 400 | 500 | 600 | 700;
}

export interface DialogOutputToken {
  text: string;
  kind: HistoryHighlightKind;
  style: DialogOutputStyle | null;
}

const BASIC_COLORS = [
  "#1e1e1e",
  "#a1260d",
  "#0b6a0b",
  "#795e26",
  "#0451a5",
  "#7a3e9d",
  "#007acc",
  "#343434",
] as const;

const BRIGHT_COLORS = [
  "#4f4f4f",
  "#c72e0f",
  "#067d17",
  "#b07d00",
  "#0451a5",
  "#9a4fd7",
  "#0f7ec7",
  "#111111",
] as const;

const ANSI_ESCAPE_PATTERN = /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
const SGR_PATTERN = /\u001b\[[0-9:;]*m/g;

interface StyledTextSegment {
  text: string;
  style: DialogOutputStyle | null;
}

interface MutableStyleState {
  color?: string;
  fontWeight?: 400 | 600;
}

export function normalizeDialogOutput(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, (match) => (isSgrSequence(match) ? match : ""));
}

export function tokenizeDialogOutput(text: string): DialogOutputToken[] {
  if (text.length === 0) {
    return [];
  }

  const segments = parseAnsiSegments(text);
  const tokens: DialogOutputToken[] = [];

  for (const segment of segments) {
    if (!segment.style) {
      for (const token of highlightOutputText(segment.text)) {
        tokens.push({
          text: token.text,
          kind: token.kind,
          style: null,
        });
      }
      continue;
    }

    tokens.push({
      text: segment.text,
      kind: "plain",
      style: segment.style,
    });
  }

  return mergeDialogOutputTokens(tokens);
}

function parseAnsiSegments(text: string): StyledTextSegment[] {
  const segments: StyledTextSegment[] = [];
  const state: MutableStyleState = {};
  let cursor = 0;

  for (const match of text.matchAll(SGR_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      pushStyledSegment(segments, text.slice(cursor, matchIndex), snapshotStyle(state));
    }

    applySgrSequence(state, match[0]);
    cursor = matchIndex + match[0].length;
  }

  if (cursor < text.length) {
    pushStyledSegment(segments, text.slice(cursor), snapshotStyle(state));
  }

  return segments;
}

function pushStyledSegment(segments: StyledTextSegment[], text: string, style: DialogOutputStyle | null) {
  if (text.length === 0) {
    return;
  }

  const previous = segments[segments.length - 1];
  if (previous && previous.text.length > 0 && sameStyle(previous.style, style)) {
    previous.text += text;
    return;
  }

  segments.push({ text, style });
}

function snapshotStyle(state: MutableStyleState): DialogOutputStyle | null {
  if (!state.color && !state.fontWeight) {
    return null;
  }

  return {
    ...(state.color ? { color: state.color } : {}),
    ...(state.fontWeight ? { fontWeight: state.fontWeight } : {}),
  };
}

function applySgrSequence(state: MutableStyleState, sequence: string) {
  const payload = sequence.slice(2, -1);
  const rawCodes = payload.length === 0 ? ["0"] : payload.split(/[;:]/);
  const codes = rawCodes
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  if (codes.length === 0) {
    resetStyle(state);
    return;
  }

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;

    if (code === 0) {
      resetStyle(state);
      continue;
    }

    if (code === 1) {
      state.fontWeight = 600;
      continue;
    }

    if (code === 22) {
      delete state.fontWeight;
      continue;
    }

    if (code >= 30 && code <= 37) {
      state.color = BASIC_COLORS[code - 30];
      continue;
    }

    if (code >= 90 && code <= 97) {
      state.color = BRIGHT_COLORS[code - 90];
      continue;
    }

    if (code === 39) {
      delete state.color;
      continue;
    }

    if (code === 38) {
      const mode = codes[index + 1];
      if (mode === 5) {
        const paletteIndex = codes[index + 2];
        if (paletteIndex !== undefined) {
          state.color = colorFrom256Palette(paletteIndex);
          index += 2;
        }
        continue;
      }

      if (mode === 2) {
        const red = codes[index + 2];
        const green = codes[index + 3];
        const blue = codes[index + 4];
        if (red !== undefined && green !== undefined && blue !== undefined) {
          state.color = rgbToHex(red, green, blue);
          index += 4;
        }
      }
    }
  }
}

function resetStyle(state: MutableStyleState) {
  delete state.color;
  delete state.fontWeight;
}

function mergeDialogOutputTokens(tokens: DialogOutputToken[]): DialogOutputToken[] {
  const merged: DialogOutputToken[] = [];

  for (const token of tokens) {
    if (token.text.length === 0) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && previous.kind === token.kind && sameStyle(previous.style, token.style)) {
      previous.text += token.text;
      continue;
    }

    merged.push({ ...token, style: token.style ? { ...token.style } : null });
  }

  return merged;
}

function sameStyle(left: DialogOutputStyle | null, right: DialogOutputStyle | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.color === right.color && left.fontWeight === right.fontWeight;
}

function isSgrSequence(sequence: string): boolean {
  return /^\u001b\[[0-9:;]*m$/.test(sequence);
}

function colorFrom256Palette(index: number): string {
  if (index < 0) {
    return BASIC_COLORS[0];
  }

  if (index < 16) {
    const palette = index < 8 ? BASIC_COLORS : BRIGHT_COLORS;
    return palette[index % 8];
  }

  if (index < 232) {
    const cubeIndex = index - 16;
    const blue = cubeIndex % 6;
    const green = Math.floor(cubeIndex / 6) % 6;
    const red = Math.floor(cubeIndex / 36) % 6;
    const channelValues = [0, 95, 135, 175, 215, 255];
    return rgbToHex(channelValues[red], channelValues[green], channelValues[blue]);
  }

  const gray = 8 + (index - 232) * 10;
  return rgbToHex(gray, gray, gray);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}
