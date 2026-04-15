import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendAiPrompt } from "./ai-prompt-transport";
import { clearRegistry, registerTerminal } from "./terminal-registry";

describe("sendAiPrompt", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("uses the registered terminal controller when available", async () => {
    const writeFallback = vi.fn(async () => undefined);
    const controller = {
      writeDirect: vi.fn(),
      pasteText: vi.fn(),
      sendEnter: vi.fn(async () => undefined),
      focus: vi.fn(),
      blur: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelectionText: vi.fn(() => ""),
    };

    registerTerminal("tab:1", controller);

    await sendAiPrompt({
      tabId: "tab:1",
      prompt: "refine the previous answer",
      writeFallback,
    });

    expect(controller.pasteText).toHaveBeenCalledWith("refine the previous answer");
    expect(controller.sendEnter).toHaveBeenCalledTimes(1);
    expect(writeFallback).not.toHaveBeenCalled();
  });

  it("falls back to carriage-return normalized PTY writes when no controller is registered", async () => {
    const writeFallback = vi.fn(async () => undefined);

    await sendAiPrompt({
      tabId: "tab:1",
      prompt: "line 1\nline 2",
      writeFallback,
    });

    expect(writeFallback).toHaveBeenNthCalledWith(1, "line 1\rline 2");
    expect(writeFallback).toHaveBeenNthCalledWith(2, "\r");
  });

  it("ignores legacy structured submitters and writes through raw terminal transport", async () => {
    const writeFallback = vi.fn(async () => undefined);
    const submitStructuredPrompt = vi.fn(async () => undefined);
    const controller = {
      writeDirect: vi.fn(),
      pasteText: vi.fn(),
      sendEnter: vi.fn(async () => undefined),
      focus: vi.fn(),
      blur: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelectionText: vi.fn(() => ""),
    };

    registerTerminal("tab:1", controller);

    await sendAiPrompt({
      tabId: "tab:1",
      prompt: "refine the previous answer",
      writeFallback,
      submitStructuredPrompt,
    } as unknown as Parameters<typeof sendAiPrompt>[0]);

    expect(submitStructuredPrompt).not.toHaveBeenCalled();
    expect(controller.pasteText).toHaveBeenCalledWith("refine the previous answer");
    expect(controller.sendEnter).toHaveBeenCalledTimes(1);
    expect(writeFallback).not.toHaveBeenCalled();
  });
});
