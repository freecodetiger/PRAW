// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShortcutRecorder } from "./ShortcutRecorder";

const LABELS = {
  pressKeys: "Press keys…",
  reset: "Reset",
  clear: "Clear",
  invalidCombination: "Use a real key combination.",
};

describe("ShortcutRecorder", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps listening after a modifier-only keydown and captures the completed chord", () => {
    const onCapture = vi.fn();

    act(() => {
      root.render(
        <ShortcutRecorder
          value={null}
          labels={LABELS}
          onCapture={onCapture}
          onClear={() => undefined}
          onReset={() => undefined}
        />,
      );
    });

    const captureButton = host.querySelector(".shortcut-recorder__capture");
    expect(captureButton).not.toBeNull();

    act(() => {
      captureButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(onCapture).not.toHaveBeenCalled();
    expect(host.textContent).toContain(LABELS.pressKeys);
    expect(host.textContent).not.toContain(LABELS.invalidCombination);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(onCapture).toHaveBeenCalledWith({
      key: "k",
      code: "KeyK",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
    });
  });
});
