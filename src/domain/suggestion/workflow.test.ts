import { describe, expect, it } from "vitest";

import type { CompletionContextSnapshot } from "../ai/types";
import type { CommandBlock } from "../terminal/dialog";
import { deriveWorkflowSuggestions } from "./workflow";

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

describe("workflow suggestions", () => {
  it("suggests git commit as the next step after git add when staged changes exist", () => {
    const suggestions = deriveWorkflowSuggestions({
      draft: "git ",
      recentCommands: ["git status", "git add ."],
      blocks: [completed("git status"), completed("git add .")],
      localContext: {
        ...baseLocalContext,
        gitStatusSummary: ["M  src/main.tsx"],
        recentHistory: ["git status", "git add ."],
      },
    });

    expect(suggestions[0]).toMatchObject({
      text: 'git commit -m ""',
      kind: "intent",
      source: "system",
      replacement: {
        type: "append",
        suffix: 'commit -m ""',
      },
    });
  });

  it("suggests git push after a successful commit on a clean branch", () => {
    const suggestions = deriveWorkflowSuggestions({
      draft: "git ",
      recentCommands: ["git add .", 'git commit -m "ship it"'],
      blocks: [completed("git add ."), completed('git commit -m "ship it"')],
      localContext: {
        ...baseLocalContext,
        recentHistory: ["git add .", 'git commit -m "ship it"'],
      },
    });

    expect(suggestions.map((suggestion) => suggestion.text)).toContain("git push");
  });

  it("suggests git add when the repository has unstaged or untracked changes", () => {
    const suggestions = deriveWorkflowSuggestions({
      draft: "git ",
      recentCommands: ["git status"],
      blocks: [completed("git status")],
      localContext: {
        ...baseLocalContext,
        gitStatusSummary: [" M src/main.tsx", "?? README.md"],
      },
    });

    expect(suggestions[0]?.text).toBe("git add .");
  });

  it("does not surface git workflow predictions once the user is clearly typing another tool", () => {
    const suggestions = deriveWorkflowSuggestions({
      draft: "pnpm ",
      recentCommands: ["git status", "git add ."],
      blocks: [completed("git status"), completed("git add .")],
      localContext: {
        ...baseLocalContext,
        gitStatusSummary: ["M  src/main.tsx"],
        recentHistory: ["git status", "git add ."],
      },
    });

    expect(suggestions).toEqual([]);
  });
});
