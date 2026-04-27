// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readStyles(): string {
  const path = fileURLToPath(new URL("./styles.css", import.meta.url));
  return readFileSync(path, "utf8");
}

describe("styles selection contract", () => {
  function readRuleBlock(selector: string): string {
    const styles = readStyles();
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
    return match?.[1] ?? "";
  }

  it("defines theme-aware selection colors for transcript surfaces", () => {
    const styles = readStyles();

    expect(styles).toContain("--selection-background:");
    expect(styles).toContain("--selection-foreground:");
    expect(styles).toContain('.app-shell[data-theme="dark"]');
    expect(styles).toContain('.app-shell[data-theme="sepia"]');
  });

  it("applies explicit selection styling to AI and dialog transcript content", () => {
    const styles = readStyles();

    expect(styles).toContain(".ai-workflow__transcript ::selection");
    expect(styles).toContain(".dialog-terminal__history ::selection");
    expect(styles).toContain(".command-block__output::selection");
  });

  it("defines styles for the docked AI bypass composer and prompt feedback", () => {
    const styles = readStyles();

    expect(styles).toContain(".terminal-pane__quick-prompt-trigger");
    expect(styles).toContain(".ai-workflow__bypass-dock-shell");
    expect(styles).toContain(".ai-workflow__bypass-panel");
    expect(styles).toContain(".ai-workflow__bypass-input");
    expect(styles).toContain(".dialog-terminal__ai-prompt-error");
    expect(styles).toContain(".dialog-terminal__ai-prompt-status");
  });

  it("styles the header quick prompt trigger as a hard rectangle", () => {
    const trigger = readRuleBlock(".terminal-pane__quick-prompt-trigger");

    expect(trigger).toContain("border-radius: 0;");
    expect(trigger).not.toContain("border-radius: 6px;");
    expect(trigger).not.toContain("border-radius: 999px;");
  });

  it("centers the expanded quick prompt panel without adding a second outer card shell", () => {
    const expanded = readRuleBlock('.ai-workflow__bypass-dock-shell[data-expanded="true"] .ai-workflow__bypass-panel');

    expect(expanded).toContain("left: 50%;");
    expect(expanded).toContain("transform: translate(-50%, -50%);");
    expect(expanded).toContain("width: min(");
    expect(expanded).toContain("padding: 0;");
    expect(expanded).not.toContain("border: 1px solid");
    expect(expanded).not.toContain("background:");
    expect(expanded).not.toContain("box-shadow:");
  });

  it("defines styles for workspace focus mode chrome", () => {
    const styles = readStyles();

    expect(styles).toContain(".workspace--focus-mode");
    expect(styles).toContain(".terminal-pane__focus-badge");
  });

  it("uses the AI theme color for the active workspace switcher item", () => {
    const activeWorkspace = readRuleBlock(".workspace-switcher-item--active");

    expect(activeWorkspace).toContain("var(--ai-theme-color)");
  });

  it("uses a deterministic base surface for the timer completion cue", () => {
    const completionCue = readRuleBlock(".global-timer__completion-cue");

    expect(completionCue).toContain("background: var(--timer-completion-surface);");
    expect(completionCue).not.toContain("backdrop-filter:");
    expect(completionCue).not.toContain("-webkit-backdrop-filter:");
  });

  it("sizes the timer completion cue as a readable completion dialog", () => {
    const styles = readStyles();
    const completionCue = readRuleBlock(".global-timer__completion-cue");
    const pixelFace = readRuleBlock(".global-timer__pixel-face");
    const completionTitle = readRuleBlock(".global-timer__completion-copy strong");
    const confirmButton = readRuleBlock(".global-timer__confirm");

    expect(completionCue).toContain("width: min(328px, calc(100vw - 32px));");
    expect(completionCue).toContain("gap: 10px;");
    expect(completionCue).toContain("padding: 18px 22px 16px;");
    expect(pixelFace).toContain("width: 64px;");
    expect(pixelFace).toContain("height: 26px;");
    expect(pixelFace).toContain("font-size: 18px;");
    expect(completionTitle).toContain("font-size: 15px;");
    expect(styles).toContain(".global-timer__completion-copy span {\n  color: var(--text-muted);\n  font-size: 13px;");
    expect(confirmButton).toContain("font-size: 12px;");
  });

  it("uses the Apple system UI stack with the configured mono font as timer fallback", () => {
    const timer = readRuleBlock(".global-timer");

    expect(timer).toContain("font-family:");
    expect(timer).toContain("-apple-system");
    expect(timer).toContain("BlinkMacSystemFont");
    expect(timer).toContain('"SF Pro Text"');
    expect(timer).toContain("var(--timer-mono-font-family)");
  });
});
