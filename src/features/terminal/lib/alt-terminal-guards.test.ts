// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { installAltTerminalMouseGuards } from "./alt-terminal-guards";

describe("alt terminal guards", () => {
  it("swallows alt-modified mouse interactions before xterm sees them", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const downStop = vi.fn();
    const downPrevent = vi.fn();
    const moveStop = vi.fn();
    const movePrevent = vi.fn();
    const cleanup = installAltTerminalMouseGuards(host);

    const downEvent = new MouseEvent("mousedown", { altKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(downEvent, "stopImmediatePropagation", { value: downStop });
    Object.defineProperty(downEvent, "preventDefault", { value: downPrevent });
    host.dispatchEvent(downEvent);

    const moveEvent = new MouseEvent("mousemove", { altKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(moveEvent, "stopImmediatePropagation", { value: moveStop });
    Object.defineProperty(moveEvent, "preventDefault", { value: movePrevent });
    document.dispatchEvent(moveEvent);

    expect(downStop).toHaveBeenCalled();
    expect(downPrevent).toHaveBeenCalled();
    expect(moveStop).toHaveBeenCalled();
    expect(movePrevent).toHaveBeenCalled();

    cleanup();
    document.body.removeChild(host);
  });
});
