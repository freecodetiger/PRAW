import type { CompletionContextSnapshot } from "../ai/types";
import type { CommandBlock } from "../terminal/dialog";
import type { SuggestionItem } from "./types";

export interface WorkflowSuggestionContext {
  draft: string;
  recentCommands: string[];
  blocks?: CommandBlock[];
  localContext?: CompletionContextSnapshot | null;
}

interface GitStatusState {
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUntrackedFiles: boolean;
}

const WORKFLOW_SOURCE = "system";

export function deriveWorkflowSuggestions(context: WorkflowSuggestionContext): SuggestionItem[] {
  if (!isGitWorkflowContext(context)) {
    return [];
  }

  const lastSuccessfulCommand = findLastSuccessfulCommand(context.blocks, context.recentCommands);
  const gitStatus = parseGitStatus(context.localContext?.gitStatusSummary ?? []);
  const suggestions: SuggestionItem[] = [];

  if (isGitAddCommand(lastSuccessfulCommand) && gitStatus.hasStagedChanges) {
    suggestions.push(
      createWorkflowSuggestion(context.draft, 'git commit -m ""', 1_260),
    );
  }

  if (isGitCommitCommand(lastSuccessfulCommand) && !hasDirtyWorkingTree(gitStatus)) {
    suggestions.push(createWorkflowSuggestion(context.draft, "git push", 1_220));
  }

  if (gitStatus.hasUnstagedChanges || gitStatus.hasUntrackedFiles) {
    suggestions.push(createWorkflowSuggestion(context.draft, "git add .", 1_080));
  }

  if (gitStatus.hasStagedChanges && !isGitAddCommand(lastSuccessfulCommand) && !isGitCommitCommand(lastSuccessfulCommand)) {
    suggestions.push(
      createWorkflowSuggestion(context.draft, 'git commit -m ""', 1_040),
    );
  }

  return dedupeSuggestions(suggestions).filter((suggestion) => isDraftCompatible(context.draft, suggestion.text));
}

export function findLastSuccessfulCommand(blocks: CommandBlock[] = [], recentCommands: string[] = []): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (
      block?.kind === "command" &&
      block.status === "completed" &&
      block.exitCode === 0 &&
      typeof block.command === "string" &&
      block.command.trim().length > 0
    ) {
      return block.command.trim();
    }
  }

  for (let index = recentCommands.length - 1; index >= 0; index -= 1) {
    const command = recentCommands[index]?.trim();
    if (command) {
      return command;
    }
  }

  return null;
}

function isGitWorkflowContext(context: WorkflowSuggestionContext): boolean {
  if (context.draft.trimStart().startsWith("git")) {
    return true;
  }

  if (context.localContext?.gitBranch) {
    return true;
  }

  return [...context.recentCommands].reverse().some((command) => command.trimStart().startsWith("git "));
}

function createWorkflowSuggestion(draft: string, text: string, score: number): SuggestionItem {
  return {
    id: `workflow:${text}`,
    text,
    kind: "intent",
    source: WORKFLOW_SOURCE,
    score,
    group: "inline",
    applyMode: "append",
    replacement: {
      type: "append",
      suffix: text.slice(draft.length),
    },
  };
}

function dedupeSuggestions(suggestions: SuggestionItem[]): SuggestionItem[] {
  const deduped = new Map<string, SuggestionItem>();

  for (const suggestion of suggestions) {
    const existing = deduped.get(suggestion.text);
    if (!existing || suggestion.score > existing.score) {
      deduped.set(suggestion.text, suggestion);
    }
  }

  return [...deduped.values()].sort((left, right) => right.score - left.score || left.text.localeCompare(right.text));
}

function parseGitStatus(lines: string[]): GitStatusState {
  let hasStagedChanges = false;
  let hasUnstagedChanges = false;
  let hasUntrackedFiles = false;

  for (const line of lines) {
    const raw = line.padEnd(2, " ");
    const first = raw[0] ?? " ";
    const second = raw[1] ?? " ";

    if (`${first}${second}` === "??") {
      hasUntrackedFiles = true;
      continue;
    }

    if (first !== " " && first !== "?") {
      hasStagedChanges = true;
    }

    if (second !== " " && second !== "?") {
      hasUnstagedChanges = true;
    }
  }

  return {
    hasStagedChanges,
    hasUnstagedChanges,
    hasUntrackedFiles,
  };
}

function hasDirtyWorkingTree(status: GitStatusState): boolean {
  return status.hasStagedChanges || status.hasUnstagedChanges || status.hasUntrackedFiles;
}

function isGitAddCommand(command: string | null): boolean {
  if (!command) {
    return false;
  }

  const normalized = command.trim();
  return normalized === "git add ." || normalized === "git add -A" || normalized.startsWith("git add ");
}

function isGitCommitCommand(command: string | null): boolean {
  return Boolean(command && command.trim().startsWith("git commit"));
}

function isDraftCompatible(draft: string, text: string): boolean {
  if (draft.length === 0) {
    return true;
  }

  return text.startsWith(draft);
}
