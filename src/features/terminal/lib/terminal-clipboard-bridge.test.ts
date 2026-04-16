import { describe, expect, it, vi } from "vitest";

import { createTerminalClipboardBridge } from "./terminal-clipboard-bridge";

describe("terminal clipboard bridge", () => {
  it("copies the current terminal selection through the shared clipboard service", async () => {
    const writeText = vi.fn(async () => undefined);
    const focus = vi.fn();
    const bridge = createTerminalClipboardBridge({
      getClipboardText: async () => "",
      setClipboardText: writeText,
    });

    await bridge.copySelection({
      getSelectionText: () => "selected text",
      focus,
    });

    expect(writeText).toHaveBeenCalledWith("selected text");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("pastes exactly once through controller.pasteText", async () => {
    const pasteText = vi.fn();
    const focus = vi.fn();
    const bridge = createTerminalClipboardBridge({
      getClipboardText: async () => "payload",
      setClipboardText: async () => undefined,
    });

    await bridge.pasteClipboard({
      pasteText,
      focus,
    });

    expect(pasteText).toHaveBeenCalledTimes(1);
    expect(pasteText).toHaveBeenCalledWith("payload");
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
