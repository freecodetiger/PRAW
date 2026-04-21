import { describe, expect, it } from "vitest";

import type { CompletionContextSnapshot } from "../ai/types";
import type { CommandBlock } from "../terminal/dialog";
import type { SessionCompletionContext, SuggestionItem } from "./types";
import { rankSuggestionItems, selectRankedGhostSuggestion } from "./ranker";
import { deriveWorkflowSuggestions } from "./workflow";
import { createEmptySessionCompletionContext } from "./session-memory";

const baseLocalContext: CompletionContextSnapshot = {
  pwd: "/USER/project",
  gitBranch: "main",
  gitStatusSummary: [],
  recentHistory: ["git status"],
  cwdSummary: {
    dirs: ["src"],
    files: ["package.json"],
  },
  systemSummary: {
    os: "ubuntu",
    shell: "/bin/bash",
    packageManager: "apt",
  },
  toolAvailability: ["git"],
};

function completed(command: string, exitCode = 0): CommandBlock {
  return {
    id: command,
    kind: "command",
    cwd: "/workspace",
    command,
    output: "",
    status: "completed",
    interactive: false,
    exitCode,
  };
}

function suggestion(overrides: Partial<SuggestionItem>): SuggestionItem {
  const text = overrides.text ?? "git status";
  const replacement =
    overrides.replacement ??
    (text.startsWith("git ")
      ? {
          type: "append" as const,
          suffix: text.slice("git ".length),
        }
      : {
          type: "append" as const,
          suffix: text,
        });

  return {
    id: overrides.id ?? text,
    text,
    kind: overrides.kind ?? "completion",
    source: overrides.source ?? "local",
    score: overrides.score ?? 900,
    group: overrides.group ?? "inline",
    applyMode: overrides.applyMode ?? "append",
    replacement,
  };
}

describe("suggestion ranker", () => {
  it("promotes workflow-aware next steps above repeated history matches", () => {
    const workflowContext = {
      draft: "git ",
      recentCommands: ["git status", "git add ."],
      blocks: [completed("git status"), completed("git add .")],
      localContext: {
        ...baseLocalContext,
        gitStatusSummary: ["M  src/main.tsx"],
        recentHistory: ["git status", "git add ."],
      },
    };

    const ranked = rankSuggestionItems({
      ...workflowContext,
      suggestions: [
        suggestion({
          id: "repeat-add",
          text: "git add .",
          source: "local",
          score: 980,
        }),
        suggestion({
          id: "status",
          text: "git status",
          source: "local",
          score: 940,
        }),
        ...deriveWorkflowSuggestions(workflowContext),
      ],
    });

    expect(ranked[0]?.text).toBe('git commit -m ""');
  });

  it("returns a ghost suggestion for a high-confidence workflow continuation", () => {
    const workflowContext = {
      draft: "git ",
      recentCommands: ["git status", "git add ."],
      blocks: [completed("git status"), completed("git add .")],
      localContext: {
        ...baseLocalContext,
        gitStatusSummary: ["M  src/main.tsx"],
        recentHistory: ["git status", "git add ."],
      },
    };

    const ghost = selectRankedGhostSuggestion({
      ...workflowContext,
      suggestions: [
        suggestion({
          id: "repeat-add",
          text: "git add .",
          source: "local",
          score: 980,
        }),
        ...deriveWorkflowSuggestions(workflowContext),
      ],
    });

    expect(ghost?.text).toBe('git commit -m ""');
  });

  it("uses the first ranked suggestion as the ghost when the Tab list already has candidates", () => {
    const ghost = selectRankedGhostSuggestion({
      draft: "git st",
      recentCommands: ["ls"],
      blocks: [completed("ls")],
      localContext: baseLocalContext,
      suggestions: [
        suggestion({
          id: "status",
          text: "git status",
          score: 920,
          replacement: {
            type: "append",
            suffix: "atus",
          },
        }),
        suggestion({
          id: "stash",
          text: "git stash",
          score: 905,
          replacement: {
            type: "append",
            suffix: "ash",
          },
        }),
      ],
    });

    expect(ghost?.text).toBe("git status");
  });

  it("uses current-session accepted feedback as a ranking hint", () => {
    const sessionContext: SessionCompletionContext = {
      ...createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
      acceptedSuggestions: [
        {
          source: "local",
          kind: "completion",
          text: "pnpm test",
          draft: "pn",
          cwd: "/workspace",
          acceptedAt: 1,
        },
      ],
    };

    const ranked = rankSuggestionItems({
      draft: "pn",
      recentCommands: [],
      blocks: [],
      localContext: baseLocalContext,
      sessionContext,
      suggestions: [
        suggestion({
          id: "dev",
          text: "pnpm run dev",
          score: 900,
          replacement: {
            type: "append",
            suffix: "pm run dev",
          },
        }),
        suggestion({
          id: "test",
          text: "pnpm test",
          score: 900,
          replacement: {
            type: "append",
            suffix: "pm test",
          },
        }),
      ],
    });

    expect(ranked[0]?.text).toBe("pnpm test");
  });

  it("lightly prefers mysql database completions over generic commands for mysql drafts", () => {
    const ranked = rankSuggestionItems({
      draft: "my",
      recentCommands: [],
      blocks: [],
      localContext: baseLocalContext,
      suggestions: [
        suggestion({
          id: "mysql",
          text: "mysql -u root -p",
          score: 900,
          replacement: {
            type: "append",
            suffix: "sql -u root -p",
          },
        }),
        suggestion({
          id: "mypy",
          text: "mypy src",
          score: 900,
          replacement: {
            type: "append",
            suffix: "py src",
          },
        }),
      ],
    });

    expect(ranked[0]?.text).toBe("mysql -u root -p");
  });
});
