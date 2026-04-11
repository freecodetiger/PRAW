import { describe, expect, it } from "vitest";

import { resolveTerminalShortcut, resolveWorkspaceShortcut } from "./shortcuts";

describe("workspace shortcuts", () => {
  it("maps ctrl+alt+arrow to pane focus", () => {
    expect(
      resolveWorkspaceShortcut({
        key: "ArrowLeft",
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toEqual({
      type: "focus-pane",
      direction: "left",
    });
  });

  it("ignores legacy tab-management shortcuts in the single-workspace shell", () => {
    expect(
      resolveWorkspaceShortcut({
        key: "t",
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceShortcut({
        key: "F2",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });
});

describe("terminal shortcuts", () => {
  it("maps linux-style clipboard shortcuts", () => {
    expect(
      resolveTerminalShortcut({
        key: "C",
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toEqual({
      type: "copy-selection",
    });

    expect(
      resolveTerminalShortcut({
        key: "Insert",
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toEqual({
      type: "paste",
    });
  });

  it("ignores unrelated keys", () => {
    expect(
      resolveTerminalShortcut({
        key: "x",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });

  it("ignores clipboard shortcuts while ime composition is active", () => {
    expect(
      resolveTerminalShortcut({
        key: "c",
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
        isComposing: true,
      }),
    ).toBeNull();
  });

  it("ignores process keys emitted by ime engines", () => {
    expect(
      resolveTerminalShortcut({
        key: "Process",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();

    expect(
      resolveTerminalShortcut({
        key: "Dead",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });
});
