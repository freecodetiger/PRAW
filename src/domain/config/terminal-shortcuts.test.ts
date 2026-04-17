import { describe, expect, it } from "vitest";

import {
  DEFAULT_TERMINAL_SHORTCUTS,
  findShortcutConflict,
  formatShortcutBinding,
  normalizeTerminalShortcutConfig,
  toShortcutBinding,
} from "./terminal-shortcuts";

describe("terminal shortcut config", () => {
  it("provides the approved default pane action bindings", () => {
    expect(DEFAULT_TERMINAL_SHORTCUTS).toEqual({
      splitRight: { key: "[", code: "BracketLeft", ctrl: true, alt: true, shift: false, meta: false },
      splitDown: { key: "]", code: "BracketRight", ctrl: true, alt: true, shift: false, meta: false },
      editNote: { key: "\\", code: "Backslash", ctrl: true, alt: true, shift: false, meta: false },
      toggleFocusPane: { key: "Enter", code: "Enter", ctrl: true, alt: true, shift: false, meta: false },
      toggleAiVoiceBypass: { key: "/", code: "Slash", ctrl: true, alt: true, shift: true, meta: false },
    });
  });

  it("falls back to defaults for malformed shortcut objects", () => {
    expect(
      normalizeTerminalShortcutConfig({
        splitRight: { key: "", ctrl: true, alt: true, shift: false, meta: false },
      }),
    ).toEqual(DEFAULT_TERMINAL_SHORTCUTS);
  });

  it("preserves an explicitly cleared binding", () => {
    expect(
      normalizeTerminalShortcutConfig({
        editNote: null,
      }).editNote,
    ).toBeNull();
  });

  it("formats a binding for settings display", () => {
    expect(
      formatShortcutBinding({ key: "]", code: "BracketRight", ctrl: true, alt: true, shift: false, meta: false }),
    ).toBe("Ctrl+Alt+]");
  });

  it("finds the conflicting pane action for a duplicate binding", () => {
    expect(
      findShortcutConflict(
        DEFAULT_TERMINAL_SHORTCUTS,
        { key: "]", ctrl: true, alt: true, shift: false, meta: false },
        "splitRight",
      ),
    ).toBe("splitDown");
  });

  it("finds conflicts involving the AI voice bypass shortcut", () => {
    expect(
      findShortcutConflict(
        DEFAULT_TERMINAL_SHORTCUTS,
        { key: "/", ctrl: true, alt: true, shift: true, meta: false },
        "splitRight",
      ),
    ).toBe("toggleAiVoiceBypass");
  });

  it("ignores modifier-only and ime keys when recording a shortcut", () => {
    expect(
      toShortcutBinding({
        key: "Control",
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();

    expect(
      toShortcutBinding({
        key: "Process",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });

  it("captures shifted punctuation using a stable physical key code", () => {
    expect(
      toShortcutBinding({
        key: "?",
        code: "Slash",
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        metaKey: false,
      }),
    ).toEqual({ key: "/", code: "Slash", ctrl: true, alt: true, shift: true, meta: false });
  });

  it("finds conflicts for the AI voice bypass shortcut even when the event key is shifted", () => {
    expect(
      findShortcutConflict(
        DEFAULT_TERMINAL_SHORTCUTS,
        { key: "/", code: "Slash", ctrl: true, alt: true, shift: true, meta: false },
        "splitRight",
      ),
    ).toBe("toggleAiVoiceBypass");
  });

  it("captures a normalized binding from a keyboard event shape", () => {
    expect(
      toShortcutBinding({
        key: "]",
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toEqual({ key: "]", code: "BracketRight", ctrl: true, alt: true, shift: false, meta: false });
  });
});
