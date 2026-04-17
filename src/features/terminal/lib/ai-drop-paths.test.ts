import { describe, expect, it } from "vitest";

import {
  appendDroppedPathsToDraft,
  formatDroppedPathsForShell,
  isDragPositionInsidePane,
} from "./ai-drop-paths";

describe("ai-drop-paths", () => {
  it("formats distinct local paths as shell-safe single-quoted tokens", () => {
    expect(
      formatDroppedPathsForShell([
        " /tmp/demo.png ",
        "",
        "/tmp/demo.png",
        "/tmp/it's here.png",
      ]),
    ).toBe("'/tmp/demo.png' '/tmp/it'\"'\"'s here.png'");
  });

  it("appends dropped paths to an existing draft without forcing a duplicate separator", () => {
    expect(appendDroppedPathsToDraft("", "'/tmp/demo.png'")).toBe("'/tmp/demo.png'");
    expect(appendDroppedPathsToDraft("look at", "'/tmp/demo.png'")).toBe("look at '/tmp/demo.png'");
    expect(appendDroppedPathsToDraft("look at ", "'/tmp/demo.png'")).toBe("look at '/tmp/demo.png'");
    expect(appendDroppedPathsToDraft("look at\n", "'/tmp/demo.png'")).toBe("look at\n'/tmp/demo.png'");
  });

  it("detects whether a physical drag position is inside the pane bounds", () => {
    const rect = {
      left: 100,
      top: 40,
      right: 320,
      bottom: 180,
    };

    expect(isDragPositionInsidePane({ x: 420, y: 160 }, rect, 2)).toBe(true);
    expect(isDragPositionInsidePane({ x: 700, y: 160 }, rect, 2)).toBe(false);
  });
});
