// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState } from "../../../domain/terminal/dialog";
import { useWorkspaceStore } from "../../terminal/state/workspace-store";
import { useTerminalViewStore } from "../../terminal/state/terminal-view-store";
import { writeDirect } from "../../terminal/lib/terminal-registry";
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
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {},
    }));
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

  it("opens a floating panel and switches workspaces from the list", () => {
    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    expect(host.querySelector(".workspace-switcher-panel")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("input[aria-label='Rename Workspace 1']")?.value).toBe("Workspace 1");
    expect(host.textContent).not.toContain("2 panes");
    expect(host.textContent).not.toContain("new session");
    expect(host.textContent).toContain("/workspace/ui");

    act(() => {
      host.querySelector<HTMLButtonElement>("[data-workspace-id='ws:1']")?.click();
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:1");
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
  });

  it("renders a sidebar logo button with the current workspace count", () => {
    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    const button = host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']");

    expect(button?.textContent?.trim()).toBe("2");
    expect(button?.querySelector(".workspace-rail__logo")).not.toBeNull();
  });

  it("shows the latest cwd and command as the workspace summary", () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "ws:1:tab:2": {
          ...createDialogState("/bin/bash", "/workspace"),
          shell: "/bin/bash",
          parserState: {
            buffer: "",
            commandBuffer: "",
            state: "idle",
            shellReady: true,
          },
          composerHistory: ["npm test", "git status"],
          blocks: [
            {
              id: "cmd-1",
              kind: "command",
              cwd: "/workspace",
              command: "npm test",
              output: "",
              status: "completed",
              interactive: false,
              exitCode: 0,
            },
            {
              id: "cmd-2",
              kind: "command",
              cwd: "/workspace",
              command: "git status",
              output: "",
              status: "completed",
              interactive: false,
              exitCode: 0,
            },
          ],
        } as any,
      },
    }));

    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    expect(host.textContent).toContain("git status");
    expect(host.textContent).toContain("/workspace");
    expect(host.textContent).not.toContain("new session");

    const commandLine = host.querySelector(".workspace-switcher-item__headline");
    expect(commandLine?.textContent).toContain("Switch");
    expect(commandLine?.textContent).toContain("git status");
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

  it("deletes a new session workspace without confirmation", () => {
    const confirm = vi.spyOn(window, "confirm");

    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Delete Workspace 2']")?.click();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.workspaceId)).toEqual([
      "ws:1",
    ]);
  });

  it("shows offset inline confirmation controls before deleting a workspace with terminal activity", () => {
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {
        "ws:1:tab:1": {
          ...createDialogState("/bin/bash", "/workspace"),
          shell: "/bin/bash",
          parserState: {
            buffer: "",
            commandBuffer: "",
            state: "idle",
            shellReady: true,
          },
          composerHistory: ["pnpm dev"],
        } as any,
      },
    }));
    writeDirect("ws:1:tab:1", "pnpm dev\n");

    act(() => {
      root.render(<WorkspaceSwitcherPanel />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open workspaces']")?.click();
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Delete Workspace 1']")?.click();
    });

    const originalDeleteButton = host.querySelector<HTMLButtonElement>("[aria-label='Delete Workspace 1']");
    const inlineConfirmation = host.querySelector<HTMLElement>("[data-confirm-delete-workspace-id='ws:1']");
    expect(host.textContent).not.toContain("Delete workspace?");
    expect(originalDeleteButton).toBeNull();
    expect(inlineConfirmation).not.toBeNull();
    const inlineButtons = Array.from(inlineConfirmation!.querySelectorAll("button"));
    expect(inlineButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Confirm workspace deletion",
      "Cancel workspace deletion",
    ]);
    expect(inlineButtons.map((button) => button.textContent?.trim())).toEqual(["Confirm", "X"]);

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Cancel workspace deletion']")?.click();
    });

    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.workspaceId)).toEqual([
      "ws:1",
      "ws:2",
    ]);

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Delete Workspace 1']")?.click();
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Confirm workspace deletion']")?.click();
    });

    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.workspaceId)).toEqual([
      "ws:2",
    ]);
  });
});
