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
  writeDirectBuffered,
  flushDirect,
  type TerminalController,
} from "./terminal-registry";
import {
  attachMirrorController,
  clearMirrors,
  createMirrorSnapshot,
  exportMirrorText,
  getMirrorSnapshot,
  MAX_MIRROR_REPLAY_TEXT_LENGTH,
  removeMirror,
  resetMirror,
  updateMirrorViewport,
  writeToMirror,
  writeRawToMirror,
} from "./terminal-screen-mirror";

describe("terminal-screen-mirror", () => {
  beforeEach(() => {
    clearRegistry();
    clearMirrors();
    removeMirror("tab:1");
    vi.useRealTimers();
  });

  it("stores the latest visible text for replay hydration", () => {
    writeToMirror("tab:1", "line 1\r\nline 2");

    expect(getMirrorSnapshot("tab:1")).toEqual(
      expect.objectContaining({
        replayText: "line 1\nline 2",
        viewportY: 0,
      }),
    );
    expect(exportMirrorText("tab:1")).toBe("line 1\nline 2");
  });

  it("collapses carriage-return progress updates into the latest visible line", () => {
    writeToMirror("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");

    expect(getMirrorSnapshot("tab:1").replayText).toBe("Receiving objects: 100%\nDone.\n");
    expect(exportMirrorText("tab:1")).toBe("Receiving objects: 100%\nDone.");
  });

  it("caps replay and export text to the recent tail for long AI output", () => {
    writeToMirror("tab:1", `HEAD\n${"a".repeat(1_200_000)}\nTAIL`);

    const snapshot = getMirrorSnapshot("tab:1");
    expect(snapshot.replayText.length).toBeLessThanOrEqual(1_048_576);
    expect(snapshot.replayText).toContain("TAIL");
    expect(snapshot.replayText).not.toContain("HEAD");
    expect(exportMirrorText("tab:1")).toContain("TAIL");
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
      content: "alpha\nbeta",
      viewportY: 9,
      archiveText: "alpha\nbeta",
    });
    expect(exportTerminalArchive("tab:1")).toBe("alpha\nbeta");

    unregisterTerminal("tab:1");
  });

  it("buffers direct terminal writes and flushes them as one ordered chunk", () => {
    vi.useFakeTimers();
    const controller = createController();
    registerTerminal("tab:1", controller);

    writeDirectBuffered("tab:1", "alpha");
    writeDirectBuffered("tab:1", " beta");

    expect(controller.writeDirect).not.toHaveBeenCalled();
    expect(getTerminalSnapshot("tab:1").content).toBe("");

    flushDirect("tab:1");

    expect(controller.writeDirect).toHaveBeenCalledTimes(1);
    expect(controller.writeDirect).toHaveBeenCalledWith("alpha beta");
    expect(getTerminalSnapshot("tab:1").content).toBe("alpha beta");
  });

  it("automatically flushes buffered direct terminal writes on the next frame window", () => {
    vi.useFakeTimers();
    const controller = createController();
    registerTerminal("tab:1", controller);

    writeDirectBuffered("tab:1", "stream");
    vi.advanceTimersByTime(15);
    expect(controller.writeDirect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(controller.writeDirect).toHaveBeenCalledWith("stream");
    expect(getTerminalSnapshot("tab:1").content).toBe("stream");
  });

  it("bounds replay and archive text to recent output", () => {
    writeToMirror("tab:1", "a".repeat(MAX_MIRROR_REPLAY_TEXT_LENGTH + 10));

    expect(getMirrorSnapshot("tab:1").replayText).toHaveLength(MAX_MIRROR_REPLAY_TEXT_LENGTH);
    expect(exportMirrorText("tab:1")).toHaveLength(MAX_MIRROR_REPLAY_TEXT_LENGTH);

    writeToMirror("tab:1", "bc");

    const snapshot = getMirrorSnapshot("tab:1");
    expect(snapshot.replayText).toHaveLength(MAX_MIRROR_REPLAY_TEXT_LENGTH);
    expect(snapshot.replayText.endsWith("bc")).toBe(true);
    expect(exportMirrorText("tab:1")?.endsWith("bc")).toBe(true);
  });

  it("can append raw agent workflow output without terminal control parsing", () => {
    writeRawToMirror("tab:1", "loading\rredraw");

    expect(getMirrorSnapshot("tab:1").replayText).toBe("loading\rredraw");
    expect(exportMirrorText("tab:1")).toBe("loading\rredraw");
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
