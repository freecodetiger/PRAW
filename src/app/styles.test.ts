// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readStyles(): string {
  const path = fileURLToPath(new URL("./styles.css", import.meta.url));
  return readFileSync(path, "utf8");
}

describe("styles selection contract", () => {
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
});
