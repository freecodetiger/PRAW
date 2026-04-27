// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "../../terminal/state/workspace-store";
import { WorkspaceSwitcherPanel } from "./WorkspaceSwitcherPanel";

describe("WorkspaceSwitcherPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });
    useWorkspaceStore.getState().splitActiveTab("horizontal");
    useWorkspaceStore.getState().createWorkspace({
      shell: "/bin/zsh",
      cwd: "/workspace/ui",
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
  });

  it("opens a floating panel and switches workspaces from the list", () => {
    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    expect(host.querySelector(".workspace-switcher-panel")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("input[aria-label='Rename Workspace 1']")?.value).toBe("Workspace 1");
    expect(host.textContent).toContain("2 panes");
    expect(host.textContent).toContain("/workspace/ui");

    act(() => {
      host.querySelector<HTMLButtonElement>("[data-workspace-id='ws:1']")?.click();
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:1");
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
  });

  it("renders an icon-only sidebar logo button", () => {
    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    const button = host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']");

    expect(button?.textContent?.trim()).toBe("");
    expect(button?.querySelector(".workspace-rail__logo")).not.toBeNull();
  });

  it("renames the active workspace inline and creates a new workspace", () => {
    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    const input = host.querySelector<HTMLInputElement>("input[aria-label='Rename Workspace 2']");
    act(() => {
      input!.value = "UI";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
      input!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Create workspace']")?.click();
    });

    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.title)).toEqual([
      "Workspace 1",
      "UI",
      "Workspace 3",
    ]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:3");
  });
});
