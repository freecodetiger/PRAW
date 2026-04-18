import { describe, expect, it } from "vitest";

import { formatDialogPromptPath } from "./dialog-prompt-path";

describe("formatDialogPromptPath", () => {
  it("keeps the full cwd when there is enough width", () => {
    expect(formatDialogPromptPath("/home/zpc/projects/praw/src/features/terminal", 720)).toBe(
      "/home/zpc/projects/praw/src/features/terminal",
    );
  });

  it("collapses to a tail-preserving compact path when width is medium", () => {
    expect(formatDialogPromptPath("/home/zpc/projects/praw/src/features/terminal", 360)).toBe(
      ".../features/terminal",
    );
  });

  it("collapses to the basename when width is very narrow", () => {
    expect(formatDialogPromptPath("/home/zpc/projects/praw/src/features/terminal", 220)).toBe("terminal");
  });

  it("preserves home shorthand and root-level names", () => {
    expect(formatDialogPromptPath("~/projects/praw", 220)).toBe("praw");
    expect(formatDialogPromptPath("/workspace", 220)).toBe("workspace");
  });
});
