import { describe, expect, it } from "vitest";

import { getAiCommandHelpText, parseAiComposerInput } from "./ai-command";

describe("ai-command parser", () => {
  it("treats plain text as a prompt", () => {
    expect(parseAiComposerInput("explain the failing test")).toEqual({
      kind: "prompt",
      text: "explain the failing test",
    });
  });

  it("parses slash commands and trims the argument tail", () => {
    expect(parseAiComposerInput(" /model   gpt-5.4  ")).toEqual({
      kind: "command",
      name: "model",
      args: "gpt-5.4",
      raw: "/model   gpt-5.4",
    });
  });

  it("falls back to an unsupported command for unknown slash commands", () => {
    expect(parseAiComposerInput("/permissions auto")).toEqual({
      kind: "command",
      name: "unsupported",
      args: "auto",
      raw: "/permissions auto",
      originalName: "permissions",
    });
  });

  it("describes the supported codex-first command set", () => {
    const help = getAiCommandHelpText("codex");

    expect(help).toContain("/new");
    expect(help).toContain("/resume");
    expect(help).toContain("/review");
    expect(help).toContain("Expert Drawer");
  });
});
