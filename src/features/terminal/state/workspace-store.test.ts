import { beforeEach, describe, expect, it } from "vitest";

import { selectActiveTab, selectActiveWorkspace, useWorkspaceStore } from "./workspace-store";

describe("workspace-store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      window: null,
      dragState: null,
      dragPreview: null,
    }));
  });

  it("creates and switches tabs while preserving each tab workspace", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().createTab({
      shell: "/usr/bin/zsh",
      cwd: "/tmp",
    });

    expect(useWorkspaceStore.getState().window?.tabOrder).toEqual(["tab:1", "tab:2"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("tab:2");
    expect(selectActiveWorkspace(useWorkspaceStore.getState())?.panes["pane:main"]?.shell).toBe("/usr/bin/zsh");

    useWorkspaceStore.getState().setActiveTab("tab:1");
    expect(selectActiveWorkspace(useWorkspaceStore.getState())?.panes["pane:main"]?.shell).toBe("/bin/bash");
  });

  it("moves active focus with keyboard navigation across the active tab layout tree", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitPane("pane:main", "horizontal");
    useWorkspaceStore.getState().splitPane("pane:2", "vertical");
    useWorkspaceStore.getState().setActivePane("pane:main");

    useWorkspaceStore.getState().focusAdjacentPane("right");
    expect(selectActiveWorkspace(useWorkspaceStore.getState())?.activePaneId).toBe("pane:2");

    useWorkspaceStore.getState().focusAdjacentPane("down");
    expect(selectActiveWorkspace(useWorkspaceStore.getState())?.activePaneId).toBe("pane:3");
  });

  it("stores drag preview separately from the persisted active workspace model", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitPane("pane:main", "horizontal");
    useWorkspaceStore.getState().beginPaneDrag("pane:main");
    useWorkspaceStore.getState().setDragPreview("pane:2", "left");

    expect(useWorkspaceStore.getState().dragPreview).toEqual({
      sourcePaneId: "pane:main",
      targetPaneId: "pane:2",
      axis: "horizontal",
      order: "before",
    });

    useWorkspaceStore.getState().clearPaneDrag();
    expect(useWorkspaceStore.getState().dragState).toBeNull();
    expect(useWorkspaceStore.getState().dragPreview).toBeNull();
  });

  it("applies the drag preview by reordering the active workspace layout", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitPane("pane:main", "horizontal");
    useWorkspaceStore.getState().splitPane("pane:2", "vertical");
    useWorkspaceStore.getState().beginPaneDrag("pane:main");
    useWorkspaceStore.getState().setDragPreview("pane:3", "top");
    useWorkspaceStore.getState().applyDragPreview();

    const workspace = selectActiveWorkspace(useWorkspaceStore.getState());
    expect(workspace?.activePaneId).toBe("pane:main");
    expect(workspace?.panes["pane:main"]?.title).toBe("Main");
    expect(useWorkspaceStore.getState().dragState).toBeNull();
    expect(useWorkspaceStore.getState().dragPreview).toBeNull();
  });

  it("closes a tab and activates a surviving neighbor", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().createTab({
      shell: "/usr/bin/zsh",
      cwd: "/tmp",
    });
    useWorkspaceStore.getState().createTab({
      shell: "/bin/fish",
      cwd: "/var/tmp",
    });

    useWorkspaceStore.getState().closeTab("tab:3");
    expect(useWorkspaceStore.getState().window?.tabOrder).toEqual(["tab:1", "tab:2"]);
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("tab:2");
  });

  it("renames a tab without disturbing the active workspace", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().renameTab("tab:1", "  Build  ");

    expect(selectActiveTab(useWorkspaceStore.getState())?.title).toBe("Build");
    expect(selectActiveWorkspace(useWorkspaceStore.getState())?.activePaneId).toBe("pane:main");
  });
});
