import { describe, expect, it } from "vitest";

import {
  applyGhostCompletion,
  buildGhostCompletionRequest,
  buildLocalCompletionRequest,
  shouldRequestGhostCompletion,
  shouldRequestLocalCompletion,
  type GhostCompletionContext,
} from "./ghost-completion";

const baseContext: GhostCompletionContext = {
  aiEnabled: true,
  apiKey: "secret-key",
  provider: "glm",
  model: "glm-5-flash",
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
};

describe("ghost-completion", () => {
  it("builds a local request from the current tab context once two characters are present", () => {
    expect(buildLocalCompletionRequest({ ...baseContext, draft: "cd" })).toEqual({
      cwd: "/workspace",
      inputPrefix: "cd",
    });
  });

  it("builds an ai request from the current tab context", () => {
    expect(buildGhostCompletionRequest(baseContext)).toEqual({
      provider: "glm",
      model: "glm-5-flash",
      apiKey: "secret-key",
      shell: "/bin/bash",
      os: "ubuntu",
      cwd: "/workspace",
      inputPrefix: "git ch",
      recentCommands: ["git status", "git add .", "pnpm test"],
    });
  });

  it("suppresses requests when the composer is mid-IME composition or cursor is not at the end", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, isComposing: true })).toBe(false);
    expect(shouldRequestGhostCompletion({ ...baseContext, cursorAtEnd: false })).toBe(false);
  });

  it("allows local completion without ai and still suppresses ai when disabled", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, aiEnabled: false, apiKey: "" })).toBe(true);
    expect(shouldRequestGhostCompletion({ ...baseContext, aiEnabled: false, apiKey: "" })).toBe(false);
  });

  it("suppresses all completion requests when the draft is too short", () => {
    expect(shouldRequestLocalCompletion({ ...baseContext, draft: "g " })).toBe(false);
    expect(shouldRequestGhostCompletion({ ...baseContext, draft: "g " })).toBe(false);
  });

  it("applies only suffix suggestions to the current draft", () => {
    expect(applyGhostCompletion("git ch", "eckout ")).toBe("git checkout ");
  });
});
