import type { AiCompletionContextPack, CompletionInputMode, SessionCompletionContext } from "./types";

const MAX_RECENT_COMMANDS = 12;
const MAX_RECENT_FAILURES = 3;
const MAX_FREQUENT_COMMANDS = 8;
const MAX_LOCAL_CANDIDATES = 8;
const MAX_HINTS = 6;

interface BuildContextPackInput {
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  context: SessionCompletionContext;
  localCandidates: string[];
}

export function buildAiCompletionContextPack({
  draft,
  inputMode,
  context,
  localCandidates,
}: BuildContextPackInput): AiCompletionContextPack {
  const recentCommands = context.recentCommands.slice(-MAX_RECENT_COMMANDS);
  const recentSuccesses = recentCommands
    .filter((command) => command.exitCode === 0)
    .map((command) => command.command)
    .slice(-MAX_RECENT_COMMANDS);
  const frequentCommands = context.cwdCommandStats[context.cwd]?.frequentCommands ?? [];

  return {
    draft,
    inputMode,
    cwd: context.cwd,
    shell: context.shell,
    recentCommands: recentCommands.map((command) => command.command),
    recentSuccesses,
    recentFailures: context.recentFailures.slice(-MAX_RECENT_FAILURES).map((failure) => ({
      command: failure.command,
      exitCode: failure.exitCode,
      outputSummary: failure.outputSummary,
    })),
    frequentCommandsInCwd: frequentCommands
      .slice(0, MAX_FREQUENT_COMMANDS)
      .map((entry) => entry.command),
    projectProfile: {
      type: context.projectProfile?.type ?? "unknown",
      scripts: context.projectProfile?.scripts.slice(0, 10) ?? [],
      packageManager: context.projectProfile?.packageManager ?? "unknown",
    },
    localCandidates: localCandidates.slice(0, MAX_LOCAL_CANDIDATES),
    userPreferenceHints: buildUserPreferenceHints(context).slice(0, MAX_HINTS),
  };
}

function buildUserPreferenceHints(context: SessionCompletionContext): string[] {
  const hints = new Set<string>();

  for (const feedback of context.acceptedSuggestions.slice(-MAX_HINTS)) {
    if (feedback.cwd === context.cwd) {
      hints.add(`accepted:${feedback.text}`);
    }
  }

  for (const feedback of context.rejectedAiSuggestions.slice(-MAX_HINTS)) {
    if (feedback.cwd === context.cwd) {
      hints.add(`rejected:${feedback.text}`);
    }
  }

  return [...hints];
}
