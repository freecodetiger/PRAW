import { beforeEach, describe, expect, it } from "vitest";

import { collectLeafIds, createLeafLayout } from "../../../domain/layout/tree";
import {
  selectActiveTab,
  selectWindowForPersistence,
  selectWorkspaceCollectionForPersistence,
  useWorkspaceStore,
} from "./workspace-store";

describe("workspace-store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      window: null,
      workspaceCollection: null,
      activeWorkspaceId: null,
      dragState: null,
      dragPreview: null,
      noteEditorTabId: null,
      voiceBypassTabId: null,
    }));
  });

  it("bootstraps a single tab region and splits from an existing tab", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");

    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["ws:1:tab:1", "ws:1:tab:2"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:2"]).toMatchObject({
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

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("ws:1:tab:2", "vertical");
    useWorkspaceStore.getState().setActiveTab("ws:1:tab:1");

    useWorkspaceStore.getState().focusAdjacentTab("right");
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("ws:1:tab:2");

    useWorkspaceStore.getState().focusAdjacentTab("down");
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("ws:1:tab:3");
  });

  it("creates, switches, and renames workspaces without dropping inactive workspace windows", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });
    useWorkspaceStore.getState().splitActiveTab("horizontal");
    useWorkspaceStore.getState().attachSession("ws:1:tab:1", "session-one", "/bin/bash", "/workspace");

    const secondWorkspaceId = useWorkspaceStore.getState().createWorkspace({
      shell: "/bin/zsh",
      cwd: "/workspace/ui",
    });

    expect(secondWorkspaceId).toBe("ws:2");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:2");
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:2:tab:1");

    useWorkspaceStore.getState().renameWorkspace("ws:2", "  UI  ");
    useWorkspaceStore.getState().switchWorkspace("ws:1");

    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:1"]?.sessionId).toBe("session-one");
    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.title)).toEqual([
      "Workspace 1",
      "UI",
    ]);
  });

  it("clears focus and transient pane UI when switching workspaces", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });
    useWorkspaceStore.getState().splitActiveTab("horizontal");
    const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;
    useWorkspaceStore.getState().enterFocusMode("ws:1:tab:2");
    useWorkspaceStore.getState().requestEditNoteForActiveTab();
    useWorkspaceStore.getState().requestAiVoiceBypassForActiveTab();

    useWorkspaceStore.getState().createWorkspace({
      shell: "/bin/bash",
      cwd: "~",
    });

    expect(useWorkspaceStore.getState().focusMode).toBeNull();
    expect(useWorkspaceStore.getState().noteEditorTabId).toBeNull();
    expect(useWorkspaceStore.getState().voiceBypassTabId).toBeNull();

    const persisted = selectWorkspaceCollectionForPersistence(useWorkspaceStore.getState());
    expect(persisted?.workspaces[0].window.layout).toEqual(layoutBeforeFocus);
  });

  it("deletes a workspace and activates a surviving neighbor without touching its sessions", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });
    useWorkspaceStore.getState().attachSession("ws:1:tab:1", "session-one", "/bin/bash", "/workspace");
    useWorkspaceStore.getState().createWorkspace({
      shell: "/bin/zsh",
      cwd: "/workspace/ui",
    });
    useWorkspaceStore.getState().attachSession("ws:2:tab:1", "session-two", "/bin/zsh", "/workspace/ui");

    useWorkspaceStore.getState().deleteWorkspace("ws:2", {
      shell: "/bin/bash",
      cwd: "/workspace",
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:1");
    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces.map((workspace) => workspace.workspaceId)).toEqual([
      "ws:1",
    ]);
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:1"]?.sessionId).toBe("session-one");
  });

  it("replaces the last deleted workspace with a new default workspace", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });

    useWorkspaceStore.getState().deleteWorkspace("ws:1", {
      shell: "/bin/zsh",
      cwd: "/replacement",
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws:2");
    expect(useWorkspaceStore.getState().workspaceCollection?.workspaces).toHaveLength(1);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:2:tab:1");
    expect(useWorkspaceStore.getState().window?.tabs["ws:2:tab:1"]).toMatchObject({
      shell: "/bin/zsh",
      cwd: "/replacement",
    });
  });

  it("stores drag preview separately from the persisted window layout model", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    useWorkspaceStore.getState().beginTabDrag("ws:1:tab:1");
    useWorkspaceStore.getState().setDragPreview("ws:1:tab:2", "left");

    expect(useWorkspaceStore.getState().dragPreview).toEqual({
      sourceLeafId: "ws:1:tab:1",
      targetLeafId: "ws:1:tab:2",
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

    useWorkspaceStore.getState().setTabNote("ws:1:tab:1", "  Dev Server  ");

    expect(selectActiveTab(useWorkspaceStore.getState())).toMatchObject({
      title: "Tab 1",
      note: "Dev Server",
    });

    useWorkspaceStore.getState().setTabNote("ws:1:tab:1", "   ");
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

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    useWorkspaceStore.getState().setTabNote("ws:1:tab:2", "Build Logs");

    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:1"]?.title).toBe("Tab 1");
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:2"]).toMatchObject({
      title: "Tab 2",
      note: "Build Logs",
    });
  });

  it("updates a running tab cwd so later splits inherit the real shell directory", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/home/zpc",
    });

    useWorkspaceStore.getState().updateTabCwd("ws:1:tab:1", "/home/zpc/projects/praw");
    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");

    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:1"]?.cwd).toBe("/home/zpc/projects/praw");
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:2"]?.cwd).toBe("/home/zpc/projects/praw");
  });

  it("splits the active tab through the dedicated active-pane action", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitActiveTab("vertical");

    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["ws:1:tab:1", "ws:1:tab:2"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
  });

  it("requests note editing for the active pane and clears that request after consumption", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().requestEditNoteForActiveTab();
    expect(useWorkspaceStore.getState().noteEditorTabId).toBe("ws:1:tab:1");

    useWorkspaceStore.getState().clearNoteEditorRequest("ws:1:tab:1");
    expect(useWorkspaceStore.getState().noteEditorTabId).toBeNull();
  });

  it("requests AI voice bypass for the active pane and clears that request after consumption", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().requestAiVoiceBypassForActiveTab();
    expect(useWorkspaceStore.getState().voiceBypassTabId).toBe("ws:1:tab:1");

    useWorkspaceStore.getState().clearAiVoiceBypassRequest("ws:1:tab:1");
    expect(useWorkspaceStore.getState().voiceBypassTabId).toBeNull();
  });

  it("applies the drag preview by reordering the window layout", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("ws:1:tab:2", "vertical");
    useWorkspaceStore.getState().beginTabDrag("ws:1:tab:1");
    useWorkspaceStore.getState().setDragPreview("ws:1:tab:3", "top");
    useWorkspaceStore.getState().applyDragPreview();

    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["ws:1:tab:2", "ws:1:tab:1", "ws:1:tab:3"]);
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:1");
    expect(useWorkspaceStore.getState().dragState).toBeNull();
    expect(useWorkspaceStore.getState().dragPreview).toBeNull();
  });

  it("closes a tab region and activates a surviving neighbor", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    useWorkspaceStore.getState().splitTab("ws:1:tab:2", "vertical");

    useWorkspaceStore.getState().closeTab("ws:1:tab:3");
    expect(collectLeafIds(useWorkspaceStore.getState().window!.layout)).toEqual(["ws:1:tab:1", "ws:1:tab:2"]);
    expect(selectActiveTab(useWorkspaceStore.getState())?.tabId).toBe("ws:1:tab:2");
  });

  it("enters focus mode with a reversible layout snapshot and restores it on exit", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;

    useWorkspaceStore.getState().enterFocusMode("ws:1:tab:2");
    expect(useWorkspaceStore.getState().focusMode).toMatchObject({
      focusedTabId: "ws:1:tab:2",
      activeTabIdBeforeFocus: "ws:1:tab:2",
    });
    expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("ws:1:tab:2"));

    useWorkspaceStore.getState().exitFocusMode();
    expect(useWorkspaceStore.getState().window?.layout).toEqual(layoutBeforeFocus);
    expect(useWorkspaceStore.getState().focusMode).toBeNull();
  });

  it("blocks split, close, drag preview, resize, and adjacent focus while focus mode is active", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;
    useWorkspaceStore.getState().enterFocusMode("ws:1:tab:2");

    useWorkspaceStore.getState().splitActiveTab("vertical");
    useWorkspaceStore.getState().focusAdjacentTab("left");
    useWorkspaceStore.getState().beginTabDrag("ws:1:tab:2");
    useWorkspaceStore.getState().setDragPreview("ws:1:tab:2", "left");
    useWorkspaceStore.getState().applyDragPreview();
    useWorkspaceStore.getState().closeTab("ws:1:tab:2");

    expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("ws:1:tab:2"));
    expect(useWorkspaceStore.getState().window?.tabs["ws:1:tab:1"]).toBeDefined();
    expect(useWorkspaceStore.getState().window?.activeTabId).toBe("ws:1:tab:2");
    expect(selectWindowForPersistence(useWorkspaceStore.getState())?.layout).toEqual(layoutBeforeFocus);
  });

  it("does not overwrite the original focus snapshot on repeated enter attempts", () => {
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "~",
    });

    useWorkspaceStore.getState().splitTab("ws:1:tab:1", "horizontal");
    const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;

    useWorkspaceStore.getState().enterFocusMode("ws:1:tab:2");
    useWorkspaceStore.getState().enterFocusMode("ws:1:tab:1");

    expect(useWorkspaceStore.getState().focusMode?.layoutBeforeFocus).toEqual(layoutBeforeFocus);
    expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("ws:1:tab:2"));
  });
});
