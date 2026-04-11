import { describe, expect, it } from "vitest";

import { tokenizeDialogOutput } from "./dialog-output";

describe("tokenizeDialogOutput", () => {
  it("preserves ANSI foreground colors for dialog output", () => {
    expect(tokenizeDialogOutput("plain \u001b[01;34msrc\u001b[0m\n")).toEqual([
      { text: "plain ", kind: "plain", style: null },
      { text: "src", kind: "plain", style: { color: "#0451a5", fontWeight: 600 } },
      { text: "\n", kind: "plain", style: null },
    ]);
  });

  it("keeps rule-based highlighting for non-ANSI segments", () => {
    expect(tokenizeDialogOutput("warning: open /tmp/build.log\n")).toEqual([
      { text: "warning", kind: "warning", style: null },
      { text: ": open ", kind: "plain", style: null },
      { text: "/tmp/build.log", kind: "path", style: null },
      { text: "\n", kind: "plain", style: null },
    ]);
  });
});
