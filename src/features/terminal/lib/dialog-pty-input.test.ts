import { describe, expect, it } from "vitest";

import { resolveDialogPtyKeyInput } from "./dialog-pty-input";

describe("dialog PTY key input", () => {
  it("maps control keys and navigation keys to PTY byte sequences", () => {
    expect(resolveDialogPtyKeyInput({ key: "Enter", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(
      "\r",
    );
    expect(resolveDialogPtyKeyInput({ key: "Backspace", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(
      "\u007f",
    );
    expect(resolveDialogPtyKeyInput({ key: "ArrowUp", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(
      "\u001b[A",
    );
    expect(resolveDialogPtyKeyInput({ key: "c", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe(
      "\u0003",
    );
  });

  it("passes printable characters through and prefixes alt-modified characters with escape", () => {
    expect(resolveDialogPtyKeyInput({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe("a");
    expect(resolveDialogPtyKeyInput({ key: "A", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBe("A");
    expect(resolveDialogPtyKeyInput({ key: "x", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe(
      "\u001bx",
    );
  });

  it("ignores browser-only shortcuts and composition placeholder keys", () => {
    expect(resolveDialogPtyKeyInput({ key: "v", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBeNull();
    expect(resolveDialogPtyKeyInput({ key: "Process", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeNull();
    expect(resolveDialogPtyKeyInput({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: true })).toBeNull();
  });
});
