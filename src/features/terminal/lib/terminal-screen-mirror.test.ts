import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRegistry,
  exportTerminalArchive,
  getTerminal,
  getTerminalSnapshot,
  registerTerminal,
  unregisterTerminal,
  updateViewport,
  writeDirect,
  type TerminalController,
} from "./terminal-registry";
import {
  attachMirrorController,
  clearMirrors,
  createMirrorSnapshot,
  exportMirrorText,
  getMirrorSnapshot,
  removeMirror,
  resetMirror,
  updateMirrorViewport,
  writeToMirror,
} from "./terminal-screen-mirror";

describe("terminal-screen-mirror", () => {
  beforeEach(() => {
    clearRegistry();
    clearMirrors();
    removeMirror("tab:1");
  });

  it("stores the latest visible text for replay hydration", () => {
    writeToMirror("tab:1", "line 1\r\nline 2");

    expect(getMirrorSnapshot("tab:1")).toEqual(
      expect.objectContaining({
        replayText: "line 1\r\nline 2",
        viewportY: 0,
      }),
    );
    expect(exportMirrorText("tab:1")).toBe("line 1\nline 2");
  });

  it("preserves viewport state independently from replay text", () => {
    writeToMirror("tab:1", "history\nmore history\n");
    updateMirrorViewport("tab:1", 42);

    expect(getMirrorSnapshot("tab:1").viewportY).toBe(42);
  });

  it("replays buffered output into a controller that attaches later", () => {
    const controller = createController();
    writeToMirror("tab:1", "before attach");

    attachMirrorController("tab:1", controller);

    expect(controller.writeDirect).toHaveBeenCalledWith("before attach");
  });

  it("clears replay and export state on reset", () => {
    writeToMirror("tab:1", "stale output");
    updateMirrorViewport("tab:1", 7);

    resetMirror("tab:1");

    expect(getMirrorSnapshot("tab:1")).toEqual(createMirrorSnapshot());
    expect(exportMirrorText("tab:1")).toBeNull();
  });

  it("keeps controller lookup working while reading replay and export from the mirror", () => {
    const controller = createController();

    registerTerminal("tab:1", controller);
    writeDirect("tab:1", "alpha\r\nbeta");
    updateViewport("tab:1", 9);

    expect(getTerminal("tab:1")).toBe(controller);
    expect(getTerminalSnapshot("tab:1")).toEqual({
      content: "alpha\r\nbeta",
      viewportY: 9,
      archiveText: "alpha\nbeta",
    });
    expect(exportTerminalArchive("tab:1")).toBe("alpha\nbeta");

    unregisterTerminal("tab:1");
  });
});

function createController(): TerminalController {
  return {
    writeDirect: vi.fn(),
    pasteText: vi.fn(),
    sendEnter: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelectionText: vi.fn(() => ""),
  };
}
