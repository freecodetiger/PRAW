import type { CommandMemory, CwdCommandStat, SessionCompletionContext, SuggestionFeedback } from "./types";

const MAX_RECENT_COMMANDS = 50;
const MAX_RECENT_FAILURES = 10;
const MAX_FEEDBACK_EVENTS = 50;
const MAX_CWD_COMMANDS = 30;
const MAX_OUTPUT_CHARS = 2048;

interface CompletedCommandInput {
  command: string;
  cwd: string;
  exitCode: number | null;
  output: string;
  completedAt: number;
}

export function createEmptySessionCompletionContext(
  tabId: string,
  cwd: string,
  shell: string,
): SessionCompletionContext {
  return {
    tabId,
    cwd,
    shell,
    recentCommands: [],
    recentFailures: [],
    cwdCommandStats: {},
    acceptedSuggestions: [],
    rejectedAiSuggestions: [],
    projectProfile: null,
  };
}

export function recordCompletedCommand(
  context: SessionCompletionContext,
  input: CompletedCommandInput,
): SessionCompletionContext {
  const outputSummary = summarizeOutput(input.output);
  const command: CommandMemory = {
    command: input.command,
    cwd: input.cwd,
    exitCode: input.exitCode,
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    outputSummary,
    outputTail: outputSummary,
  };
  const recentCommands = bounded([...context.recentCommands, command], MAX_RECENT_COMMANDS);
  const recentFailures =
    typeof input.exitCode === "number" && input.exitCode !== 0
      ? bounded(
          [
            ...context.recentFailures,
            {
              command: input.command,
              cwd: input.cwd,
              exitCode: input.exitCode,
              outputSummary,
              occurredAt: input.completedAt,
            },
          ],
          MAX_RECENT_FAILURES,
        )
      : context.recentFailures;

  return {
    ...context,
    cwd: input.cwd,
    recentCommands,
    recentFailures,
    cwdCommandStats: updateCwdStats(context.cwdCommandStats, input),
  };
}

export function recordAcceptedSuggestion(
  context: SessionCompletionContext,
  feedback: SuggestionFeedback,
): SessionCompletionContext {
  return {
    ...context,
    acceptedSuggestions: bounded([...context.acceptedSuggestions, feedback], MAX_FEEDBACK_EVENTS),
  };
}

export function recordRejectedAiSuggestions(
  context: SessionCompletionContext,
  feedback: SuggestionFeedback[],
): SessionCompletionContext {
  return {
    ...context,
    rejectedAiSuggestions: bounded([...context.rejectedAiSuggestions, ...feedback], MAX_FEEDBACK_EVENTS),
  };
}

function updateCwdStats(
  stats: SessionCompletionContext["cwdCommandStats"],
  input: CompletedCommandInput,
): SessionCompletionContext["cwdCommandStats"] {
  const current = stats[input.cwd] ?? {
    cwd: input.cwd,
    frequentCommands: [],
  };
  const existing = current.frequentCommands.find((entry) => entry.command === input.command);
  const nextEntry: CwdCommandStat = {
    command: input.command,
    count: (existing?.count ?? 0) + 1,
    lastUsedAt: input.completedAt,
    successCount: (existing?.successCount ?? 0) + (input.exitCode === 0 ? 1 : 0),
    failureCount: (existing?.failureCount ?? 0) + (input.exitCode && input.exitCode !== 0 ? 1 : 0),
  };
  const frequentCommands = [
    nextEntry,
    ...current.frequentCommands.filter((entry) => entry.command !== input.command),
  ]
    .sort((left, right) => right.count - left.count || right.lastUsedAt - left.lastUsedAt || left.command.localeCompare(right.command))
    .slice(0, MAX_CWD_COMMANDS);

  return {
    ...stats,
    [input.cwd]: {
      cwd: input.cwd,
      frequentCommands,
    },
  };
}

function summarizeOutput(output: string): string {
  return sanitizeSecrets(output).slice(-MAX_OUTPUT_CHARS).trim();
}

function sanitizeSecrets(value: string): string {
  return value
    .replace(/\b(token|password|api[_-]?key)=\S+/gi, "$1=[redacted]")
    .replace(/\bauthorization:\s*\S+/gi, "authorization: [redacted]");
}

function bounded<T>(items: T[], max: number): T[] {
  return items.slice(Math.max(0, items.length - max));
}
