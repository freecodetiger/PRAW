import { describe, expect, it } from "vitest";

import type { CompletionContextSnapshot } from "../../../domain/ai/types";
import {
  applyGhostCompletion,
  buildGhostCompletionRequest,
  buildLocalCompletionRequest,
  shouldRequestGhostCompletion,
  shouldRequestLocalCompletion,
  type GhostCompletionContext,
} from "./ghost-completion";

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

const baseContext: GhostCompletionContext = {
  aiEnabled: true,
  apiKey: "secret-key",
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

describe("ghost-completion", () => {
  it("builds a local request from the current tab context once two characters are present", () => {
    expect(buildLocalCompletionRequest({ ...baseContext, draft: "cd" })).toEqual({
      cwd: "/workspace",
      inputPrefix: "cd",
      shell: "/bin/bash",
      recentHistory: ["git status", "git add .", "pnpm test"],
    });
  });

  it("builds an ai request from the current tab context and local snapshot", () => {
    expect(buildGhostCompletionRequest(baseContext)).toEqual({
      provider: "glm",
      model: "glm-4.7-flash",
      apiKey: "secret-key",
      prefix: "git ch",
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

  it("suppresses ai requests until local context is available", () => {
    expect(buildGhostCompletionRequest({ ...baseContext, localContext: null })).toBeNull();
  });

  it("suppresses requests when the composer is mid-IME composition or cursor is not at the end", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, isComposing: true })).toBe(false);
    expect(shouldRequestGhostCompletion({ ...baseContext, cursorAtEnd: false })).toBe(false);
  });

  it("allows local completion without ai and still suppresses ai when disabled", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, aiEnabled: false, apiKey: "" })).toBe(true);
    expect(shouldRequestGhostCompletion({ ...baseContext, aiEnabled: false, apiKey: "" })).toBe(false);
  });

  it("suppresses ai requests when provider or model is missing", () => {
    expect(shouldRequestGhostCompletion({ ...baseContext, provider: "" as never })).toBe(false);
    expect(shouldRequestGhostCompletion({ ...baseContext, model: "" })).toBe(false);
    expect(buildGhostCompletionRequest({ ...baseContext, provider: "" as never })).toBeNull();
    expect(buildGhostCompletionRequest({ ...baseContext, model: "" })).toBeNull();
  });

  it("suppresses all completion requests when the draft is too short", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, draft: "g " })).toBe(false);
    expect(shouldRequestGhostCompletion({ ...baseContext, draft: "g " })).toBe(false);
  });

  it("applies only suffix suggestions to the current draft", () => {
    expect(applyGhostCompletion("git ch", "eckout ")).toBe("git checkout ");
  });

  it("suppresses async completion requests while phrase completion is active", () => {
    expect(
      shouldRequestLocalCompletion({
        ...baseContext,
        draft: "cd p",
        suppressAsyncCompletion: true,
      }),
    ).toBe(false);

    expect(
      buildLocalCompletionRequest({
        ...baseContext,
        draft: "cd p",
        suppressAsyncCompletion: true,
      }),
    ).toBeNull();

    expect(
      buildGhostCompletionRequest({
        ...baseContext,
        draft: "cd p",
        suppressAsyncCompletion: true,
      }),
    ).toBeNull();
  });
});
