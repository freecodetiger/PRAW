// @vitest-environment jsdom

import { act } from "react";
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
});
