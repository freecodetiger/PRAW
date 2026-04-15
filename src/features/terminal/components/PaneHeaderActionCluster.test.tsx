// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaneHeaderActionCluster } from "./PaneHeaderActionCluster";

describe("PaneHeaderActionCluster", () => {
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

  it("renders the focus button beside the split buttons with a fullscreen icon", () => {
    act(() => {
      root.render(
        <PaneHeaderActionCluster
          canSplitRight={true}
          canSplitDown={true}
          isFocusedPane={false}
          canClose={true}
          menuActions={[]}
          onSplitRight={vi.fn()}
          onSplitDown={vi.fn()}
          onToggleFocus={vi.fn()}
          onMenuSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Split Right",
      "Split Down",
      "Enter Pane Fullscreen",
      "Pane actions",
      "Close tab",
    ]);
    expect(buttons[2]?.getAttribute("aria-label")).toBe("Enter Pane Fullscreen");
    expect(buttons[2]?.querySelector(".pane-header-actions__focus-icon")?.tagName).toBe("svg");
  });
});
