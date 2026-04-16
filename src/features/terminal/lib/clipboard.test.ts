// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeClipboardText } from "./clipboard";

describe("clipboard", () => {
  const writeText = vi.fn(async () => undefined);
  const execCommand = vi.fn(() => true);

  beforeEach(() => {
    writeText.mockReset();
    execCommand.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses navigator clipboard when available", async () => {
    await writeClipboardText("pong");

    expect(writeText).toHaveBeenCalledWith("pong");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to document.execCommand when navigator clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));

    await writeClipboardText("pong");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("restores the previous active element after execCommand fallback copy", async () => {
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    writeText.mockRejectedValueOnce(new Error("denied"));

    await writeClipboardText("pong");

    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
