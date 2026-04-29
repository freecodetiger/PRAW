// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiModePromptOverlay } from "./AiModePromptOverlay";

describe("AiModePromptOverlay", () => {
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
    vi.restoreAllMocks();
  });

  it("focuses the bypass input without forcing the viewport to scroll", () => {
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    act(() => {
      root.render(
        <AiModePromptOverlay
          expanded={true}
          draft=""
          onChange={() => undefined}
          onCollapse={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not synchronously measure textarea layout while the draft changes", () => {
    const scrollHeightSpy = vi.fn(() => 80);
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get: scrollHeightSpy,
    });

    act(() => {
      root.render(
        <AiModePromptOverlay
          expanded={true}
          draft="a"
          onChange={() => undefined}
          onCollapse={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });

    act(() => {
      root.render(
        <AiModePromptOverlay
          expanded={true}
          draft="ab"
          onChange={() => undefined}
          onCollapse={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });

    expect(scrollHeightSpy).not.toHaveBeenCalled();
  });

  it("commits Chinese smart quotes atomically without leaving the caret inside an IME quote pair", async () => {
    function ControlledOverlay() {
      const [draft, setDraft] = useState("hello ");

      return (
        <AiModePromptOverlay
          expanded={true}
          draft={draft}
          onChange={setDraft}
          onCollapse={() => undefined}
          onSubmit={() => undefined}
        />
      );
    }

    await act(async () => {
      root.render(<ControlledOverlay />);
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement;
    input.setSelectionRange(6, 6);

    await act(async () => {
      input.dispatchEvent(new FakeBeforeInputEvent("“”"));
      await Promise.resolve();
    });

    expect(input.value).toBe("hello “");
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(7);
  });
});

class FakeBeforeInputEvent extends Event {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;
  stopImmediatePropagation = vi.fn();

  constructor(data: string) {
    super("beforeinput", { bubbles: true, cancelable: true });
    this.data = data;
    this.inputType = "insertText";
    this.isComposing = false;
  }
}
