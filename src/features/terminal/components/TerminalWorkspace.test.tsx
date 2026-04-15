// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppConfigStore } from "../../config/state/app-config-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalWorkspace } from "./TerminalWorkspace";

vi.mock("./LayoutTree", () => ({
  LayoutTree: () => <div data-testid="layout-tree" />,
}));

describe("TerminalWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    useAppConfigStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
      },
    }));
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it("adds workspace focus chrome when focus mode is active", () => {
    useWorkspaceStore.getState().enterFocusMode("tab:1");

    act(() => {
      root.render(<TerminalWorkspace />);
    });

    expect(host.querySelector(".workspace")?.className).toContain("workspace--focus-mode");
  });
});
