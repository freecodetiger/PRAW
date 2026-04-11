import { beforeEach, describe, expect, it } from "vitest";

import { collectLeafIds } from "../../../domain/layout/tree";
import { selectActiveTab, useWorkspaceStore } from "./workspace-store";

describe("workspace-store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      window: null,
      dragState: null,
      dragPreview: null,
    }));
  });

  it("bootstraps a single tab region and splits from an existing tab", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");

    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["tab:1", "tab:2"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("tab:2");
    expect(useWorkspaceStore.getState().window?.tabs["tab:2"]).toMatchObject({
      title: "Tab 2",
      shell: "/bin/bash",
      cwd: "~",
    });
  });

  it("moves active focus with keyboard navigation across the window layout tree", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("tab:2", "vertical");
    useWorkspaceStore.getState().setActiveTab("tab:1");

    useWorkspaceStore.getState().focusAdjacentTab("right");
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("tab:2");

    useWorkspaceStore.getState().focusAdjacentTab("down");
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("tab:3");
  });

  it("stores drag preview separately from the persisted window layout model", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
    useWorkspaceStore.getState().beginTabDrag("tab:1");
    useWorkspaceStore.getState().setDragPreview("tab:2", "left");

    expect(useWorkspaceStore.getState().dragPreview).toEqual({
      sourceLeafId: "tab:1",
      targetLeafId: "tab:2",
      axis: "horizontal",
      order: "before",
    });

    useWorkspaceStore.getState().clearPaneDrag();
    expect(useWorkspaceStore.getState().dragState).toBeNull();
    expect(useWorkspaceStore.getState().dragPreview).toBeNull();
  });

  it("stores a trimmed tab note without changing the stable title", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().setTabNote("tab:1", "  Dev Server  ");

    expect(selectActiveTab(useWorkspaceStore.getState())).toMatchObject({
      title: "Tab 1",
      note: "Dev Server",
    });

    useWorkspaceStore.getState().setTabNote("tab:1", "   ");
    expect(selectActiveTab(useWorkspaceStore.getState())).toMatchObject({
      title: "Tab 1",
      note: undefined,
    });
  });

  it("allows split-created tabs to keep stable titles while notes change independently", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
    useWorkspaceStore.getState().setTabNote("tab:2", "Build Logs");

    expect(useWorkspaceStore.getState().window?.tabs["tab:1"]?.title).toBe("Tab 1");
    expect(useWorkspaceStore.getState().window?.tabs["tab:2"]).toMatchObject({
      title: "Tab 2",
      note: "Build Logs",
    });
  });

  it("applies the drag preview by reordering the window layout", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("tab:2", "vertical");
    useWorkspaceStore.getState().beginTabDrag("tab:1");
    useWorkspaceStore.getState().setDragPreview("tab:3", "top");
    useWorkspaceStore.getState().applyDragPreview();

    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["tab:2", "tab:1", "tab:3"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("tab:1");
    expect(useWorkspaceStore.getState().dragState).toBeNull();
    expect(useWorkspaceStore.getState().dragPreview).toBeNull();
  });

  it("closes a tab region and activates a surviving neighbor", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("tab:2", "vertical");

    useWorkspaceStore.getState().closeTab("tab:3");
    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["tab:1", "tab:2"]);
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("tab:2");
  });
});
