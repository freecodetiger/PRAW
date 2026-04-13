import { describe, expect, it } from "vitest";

import type { CompletionContextSnapshot } from "../../../domain/ai/types";
import type { CommandBlock } from "../../../domain/terminal/dialog";
import type { CompletionCandidate } from "../../../domain/ai/types";
import {
  buildAiInlineSuggestionRequest,
  buildRecoverySuggestionRequest,
  buildSuggestionFromLocalCandidate,
  findMostRecentFailedCommandBlock,
  shouldRequestRecoverySuggestions,
  type SuggestionEngineContext,
} from "./suggestion-engine";

const completionContext: CompletionContextSnapshot = {
  pwd: "/USER/project",
  gitBranch: "main",
  gitStatusSummary: ["M src/main.tsx"],
  recentHistory: ["git status", "git add .", "pnpm test"],
  cwdSummary: {
    dirs: ["src", "docs"],
    files: ["package.json", "README.md"],
  },
  systemSummary: {
    os: "ubuntu",
    shell: "/bin/bash",
    packageManager: "apt",
  },
  toolAvailability: ["git", "docker"],
};

const baseContext: SuggestionEngineContext = {
  aiEnabled: true,
  apiKey: "secret-key",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  provider: "glm",
  model: "glm-4.7-flash",
  shell: "/bin/bash",
  cwd: "/workspace",
  draft: "git ch",
  recentCommands: ["git status", "git add .", "pnpm test"],
  status: "running",
  mode: "dialog",
  cursorAtEnd: true,
  browsingHistory: false,
  isComposing: false,
  isFocused: true,
  sessionId: "sess-123",
  userId: "user-123",
  localContext: completionContext,
};

function failedBlock(overrides: Partial<CommandBlock> = {}): CommandBlock {
  return {
    id: overrides.id ?? "cmd:1",
    kind: overrides.kind ?? "command",
    cwd: overrides.cwd ?? "/workspace",
    command: overrides.command ?? "gti sttaus",
    output: overrides.output ?? "git: 'sttaus' is not a git command\n",
    status: overrides.status ?? "completed",
    interactive: overrides.interactive ?? false,
    exitCode: overrides.exitCode ?? 1,
  };
}

describe("suggestion-engine", () => {
  it("builds an inline ai request from local context", () => {
    expect(buildAiInlineSuggestionRequest(baseContext)).toEqual({
      provider: "glm",
      model: "glm-4.7-flash",
      apiKey: "secret-key",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      draft: "git ch",
      pwd: "/USER/project",
      gitBranch: "main",
      gitStatusSummary: ["M src/main.tsx"],
      recentHistory: ["git status", "git add .", "pnpm test"],
      cwdSummary: {
        dirs: ["src", "docs"],
        files: ["package.json", "README.md"],
      },
      systemSummary: {
        os: "ubuntu",
        shell: "/bin/bash",
        packageManager: "apt",
      },
      toolAvailability: ["git", "docker"],
      sessionId: "sess-123",
      userId: "user-123",
    });
  });

  it("maps local completion candidates into append-style inline suggestions", () => {
    const candidate: CompletionCandidate = {
      text: "git checkout main",
      source: "local",
      score: 940,
      kind: "git",
    };

    expect(buildSuggestionFromLocalCandidate("git ch", candidate)).toMatchObject({
      text: "git checkout main",
      kind: "completion",
      applyMode: "append",
      group: "inline",
      replacement: {
        type: "append",
        suffix: "eckout main",
      },
    });
  });

  it("finds the most recent failed completed command block", () => {
    expect(
      findMostRecentFailedCommandBlock([
        failedBlock({ id: "cmd:0", command: "git status", exitCode: 0 }),
        failedBlock({ id: "cmd:1", command: "gti sttaus", exitCode: 1 }),
      ]),
    ).toMatchObject({
      id: "cmd:1",
      command: "gti sttaus",
      exitCode: 1,
    });
  });

  it("builds a recovery request from the latest failed command", () => {
    expect(
      buildRecoverySuggestionRequest(baseContext, failedBlock()),
    ).toEqual({
      provider: "glm",
      model: "glm-4.7-flash",
      apiKey: "secret-key",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      command: "gti sttaus",
      output: "git: 'sttaus' is not a git command\n",
      exitCode: 1,
      cwd: "/workspace",
      shell: "/bin/bash",
      recentHistory: ["git status", "git add .", "pnpm test"],
      sessionId: "sess-123",
      userId: "user-123",
    });
  });

  it("only requests recovery suggestions for a failed command while the draft is empty", () => {
    expect(shouldRequestRecoverySuggestions(baseContext, failedBlock())).toBe(false);
    expect(shouldRequestRecoverySuggestions({ ...baseContext, draft: "" }, failedBlock())).toBe(true);
    expect(shouldRequestRecoverySuggestions({ ...baseContext, draft: "" }, failedBlock({ exitCode: 0 }))).toBe(false);
  });

  it("allows Qwen recovery suggestions through generic capability checks", () => {
    expect(
      shouldRequestRecoverySuggestions(
        {
          ...baseContext,
          provider: "qwen",
          model: "qwen-plus",
          apiKey: "secret-key",
          draft: "",
        },
        failedBlock(),
      ),
    ).toBe(true);
  });
});
