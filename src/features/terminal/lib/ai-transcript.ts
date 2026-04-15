export interface AiTranscriptPromptEntry {
  id: string;
  kind: "prompt";
  text: string;
}

export interface AiTranscriptOutputEntry {
  id: string;
  kind: "output";
  text: string;
  status: "streaming" | "completed";
}

export interface AiTranscriptSystemEntry {
  id: string;
  kind: "system";
  text: string;
  tone: "info" | "warning" | "error";
}

export type AiTranscriptEntry = AiTranscriptPromptEntry | AiTranscriptOutputEntry | AiTranscriptSystemEntry;

export interface AiTranscriptState {
  entries: AiTranscriptEntry[];
}

export function createAiTranscriptState(): AiTranscriptState {
  return {
    entries: [],
  };
}

export function appendAiTranscriptPrompt(
  state: AiTranscriptState,
  prompt: string,
  createId: () => string,
): AiTranscriptState {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return state;
  }

  return {
    entries: [
      ...state.entries,
      {
        id: createId(),
        kind: "prompt",
        text: normalizedPrompt,
      },
    ],
  };
}

export function appendAiTranscriptOutput(
  state: AiTranscriptState,
  output: string,
  createId: () => string,
): AiTranscriptState {
  if (!output) {
    return state;
  }

  const lastEntry = state.entries[state.entries.length - 1];
  if (lastEntry?.kind === "output" && lastEntry.status === "streaming") {
    return {
      entries: [
        ...state.entries.slice(0, -1),
        {
          ...lastEntry,
          text: `${lastEntry.text}${output}`,
        },
      ],
    };
  }

  return {
    entries: [
      ...state.entries,
      {
        id: createId(),
        kind: "output",
        text: output,
        status: "streaming",
      },
    ],
  };
}

export function appendAiTranscriptSystem(
  state: AiTranscriptState,
  message: string,
  createId: () => string,
  tone: AiTranscriptSystemEntry["tone"] = "info",
): AiTranscriptState {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return state;
  }

  return {
    entries: [
      ...state.entries,
      {
        id: createId(),
        kind: "system",
        text: normalizedMessage,
        tone,
      },
    ],
  };
}

export function completeAiTranscriptOutput(state: AiTranscriptState): AiTranscriptState {
  const lastEntry = state.entries[state.entries.length - 1];
  if (!lastEntry || lastEntry.kind !== "output" || lastEntry.status === "completed") {
    return state;
  }

  return {
    entries: [
      ...state.entries.slice(0, -1),
      {
        ...lastEntry,
        status: "completed",
      },
    ],
  };
}

export function clearAiTranscript(): AiTranscriptState {
  return createAiTranscriptState();
}
