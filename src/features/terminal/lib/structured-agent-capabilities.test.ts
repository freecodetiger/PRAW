import { describe, expect, it } from "vitest";

import {
  buildComposerPlaceholder,
  buildHelpText,
  getFallbackStructuredAgentCapabilities,
} from "./structured-agent-capabilities";

describe("structured agent capabilities", () => {
  it("builds capsule-friendly placeholders from runtime capabilities", () => {
    expect(buildComposerPlaceholder(getFallbackStructuredAgentCapabilities("codex"), "Codex")).toBe(
      "Message Codex or use /help, /new, /resume, /review, /model",
    );

    expect(buildComposerPlaceholder(getFallbackStructuredAgentCapabilities("qwen"), "Qwen")).toBe(
      "Message Qwen or use /help, /new, /resume, /model",
    );
  });

  it("builds help text without codex-only copy when capabilities do not support review", () => {
    const help = buildHelpText(getFallbackStructuredAgentCapabilities("qwen"), "Qwen");

    expect(help).toContain("/resume <session-id>");
    expect(help).toContain("/model");
    expect(help).not.toContain("Codex session");
    expect(help).not.toContain("/review");
  });
});
