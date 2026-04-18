import { create } from "zustand";

import {
  MIN_BOUNDARY_PANE_HEIGHT_PX,
  MIN_INTERIOR_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  resizeContainerDivider,
  type LayoutFrame,
  type PaneMinimumResolver,
} from "../../../domain/layout/geometry";
import {
  applyLeafDragPreview,
  collectLeafIds,
  countLeaves,
  createLeafDragPreview,
  createLeafLayout,
  findAdjacentLeafId,
  removeLeaf,
  splitLeaf,
} from "../../../domain/layout/tree";
import type { FocusDirection, LayoutNode, PaneDragPreview, PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { fromWindowSnapshot, type WindowSnapshot } from "../../../domain/window/snapshot";
import type { TabModel, WindowModel } from "../../../domain/window/types";
import { selectTerminalTabState, useTerminalViewStore } from "./terminal-view-store";

interface BootstrapWindowOptions {
  shell: string;
  cwd: string;
}

interface WorkspaceFocusMode {
  focusedTabId: string;
  layoutBeforeFocus: LayoutNode;
  activeTabIdBeforeFocus: string;
}

interface WorkspaceStore {
  window: WindowModel | null;
  focusMode: WorkspaceFocusMode | null;
  dragState: { sourceTabId: string } | null;
  dragPreview: PaneDragPreview | null;
  noteEditorTabId: string | null;
  voiceBypassTabId: string | null;
  bootstrapWindow: (options: BootstrapWindowOptions) => void;
  hydrateWindow: (snapshot: WindowSnapshot) => void;
  setActiveTab: (tabId: string) => void;
  setTabNote: (tabId: string, note: string) => void;
  splitTab: (tabId: string, axis: SplitAxis) => void;
  splitActiveTab: (axis: SplitAxis) => void;
  resizeSplit: (containerId: string, dividerIndex: number, deltaPx: number, frame: LayoutFrame) => void;
  focusAdjacentTab: (direction: FocusDirection) => void;
  closeTab: (tabId: string) => void;
  beginTabDrag: (tabId: string) => void;
  setDragPreview: (targetTabId: string, edge: PaneDropEdge) => void;
  applyDragPreview: () => void;
  clearPaneDrag: () => void;
  requestEditNoteForActiveTab: () => void;
  clearNoteEditorRequest: (tabId: string) => void;
  requestAiVoiceBypassForActiveTab: () => void;
  clearAiVoiceBypassRequest: (tabId: string) => void;
  enterFocusMode: (tabId: string) => void;
  exitFocusMode: () => void;
  toggleFocusMode: (tabId: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
  attachSession: (tabId: string, sessionId: string, shell: string, cwd: string) => void;
  markTabExited: (
    tabId: string,
    exitCode: number | null | undefined,
    signal: string | null | undefined,
    error?: string | null,
  ) => void;
  markTabError: (tabId: string, message: string) => void;
  restartTab: (tabId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  window: null,
  focusMode: null,
  dragState: null,
  dragPreview: null,
  noteEditorTabId: null,
  voiceBypassTabId: null,

  bootstrapWindow: ({ shell, cwd }) =>
    set(() => ({
      window: createBootstrapWindowModel(shell, cwd),
      focusMode: null,
      dragState: null,
      dragPreview: null,
      noteEditorTabId: null,
      voiceBypassTabId: null,
    })),

  hydrateWindow: (snapshot) =>
    set(() => ({
      window: fromWindowSnapshot(snapshot),
      focusMode: null,
      dragState: null,
      dragPreview: null,
      noteEditorTabId: null,
      voiceBypassTabId: null,
    })),

  setActiveTab: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId]) {
        return state;
      }

      return {
        window: {
          ...state.window,
          activeTabId: tabId,
        },
      };
    }),

  setTabNote: (tabId, note) =>
    set((state) => {
      return updateTabState(state, tabId, (tab) => {
        const normalizedNote = note.trim();
        const nextNote = normalizedNote.length > 0 ? normalizedNote : undefined;

        if (tab.note === nextNote) {
          return tab;
        }

        return {
          ...tab,
          note: nextNote,
        };
      });
    }),

  splitTab: (tabId, axis) =>
    set((state) => {
      if (state.focusMode || !state.window?.tabs[tabId]) {
        return state;
      }

      return splitWindowTab(state, tabId, axis);
    }),

  splitActiveTab: (axis) =>
    set((state) => {
      if (!state.window || state.focusMode) {
        return state;
      }

      return splitWindowTab(state, state.window.activeTabId, axis);
    }),

  resizeSplit: (containerId, dividerIndex, deltaPx, frame) =>
    set((state) => {
      if (!state.window || state.focusMode || frame.widthPx <= 0 || frame.heightPx <= 0 || deltaPx === 0) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: resizeContainerDivider(
            state.window.layout,
            frame,
            {
              containerId,
              dividerIndex,
              deltaPx,
            },
            createPaneMinimumResolver(),
          ),
        },
      };
    }),

  focusAdjacentTab: (direction) =>
    set((state) => {
      if (!state.window || state.focusMode) {
        return state;
      }

      const nextTabId = findAdjacentLeafId(state.window.layout, state.window.activeTabId, direction);
      if (!nextTabId) {
        return state;
      }

      return {
        window: {
          ...state.window,
          activeTabId: nextTabId,
        },
      };
    }),

  closeTab: (tabId) =>
    set((state) => {
      if (state.focusMode || !state.window?.tabs[tabId] || countLeaves(state.window.layout) <= 1) {
        return state;
      }

      const leafOrder = collectLeafIds(state.window.layout);
      const nextLayout = removeLeaf(state.window.layout, tabId);
      if (!nextLayout) {
        return state;
      }

      const tabs = { ...state.window.tabs };
      delete tabs[tabId];
      const closedIndex = leafOrder.indexOf(tabId);
      const survivingLeafOrder = collectLeafIds(nextLayout);
      const nextActiveTabId =
        state.window.activeTabId === tabId
          ? survivingLeafOrder[Math.max(0, Math.min(closedIndex - 1, survivingLeafOrder.length - 1))]
          : state.window.activeTabId;

      return {
        window: {
          ...state.window,
          layout: nextLayout,
          tabs,
          activeTabId: nextActiveTabId,
        },
        dragState: state.dragState?.sourceTabId === tabId ? null : state.dragState,
        dragPreview:
          state.dragPreview?.sourceLeafId === tabId || state.dragPreview?.targetLeafId === tabId ? null : state.dragPreview,
      };
    }),

  beginTabDrag: (tabId) =>
    set((state) => {
      if (state.focusMode || !state.window?.tabs[tabId]) {
        return state;
      }

      return {
        dragState: {
          sourceTabId: tabId,
        },
        dragPreview: null,
      };
    }),

  setDragPreview: (targetTabId, edge) =>
    set((state) => {
      if (!state.window || state.focusMode || !state.dragState) {
        return state;
      }

      return {
        dragPreview: createLeafDragPreview(state.window.layout, state.dragState.sourceTabId, targetTabId, edge),
      };
    }),

  applyDragPreview: () =>
    set((state) => {
      if (!state.window || state.focusMode || !state.dragPreview) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: applyLeafDragPreview(state.window.layout, state.dragPreview),
          activeTabId: state.dragPreview.sourceLeafId,
        },
        dragState: null,
        dragPreview: null,
      };
    }),

  clearPaneDrag: () =>
    set(() => ({
      dragState: null,
      dragPreview: null,
    })),

  requestEditNoteForActiveTab: () =>
    set((state) => {
      if (!state.window) {
        return state;
      }

      return {
        noteEditorTabId: state.window.activeTabId,
      };
    }),

  clearNoteEditorRequest: (tabId) =>
    set((state) => ({
      noteEditorTabId: state.noteEditorTabId === tabId ? null : state.noteEditorTabId,
    })),

  requestAiVoiceBypassForActiveTab: () =>
    set((state) => {
      if (!state.window || state.focusMode) {
        return state;
      }

      return {
        voiceBypassTabId: state.window.activeTabId,
      };
    }),

  clearAiVoiceBypassRequest: (tabId) =>
    set((state) => ({
      voiceBypassTabId: state.voiceBypassTabId === tabId ? null : state.voiceBypassTabId,
    })),

  enterFocusMode: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId] || state.focusMode) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: createLeafLayout(tabId),
          activeTabId: tabId,
        },
        focusMode: {
          focusedTabId: tabId,
          layoutBeforeFocus: state.window.layout,
          activeTabIdBeforeFocus: state.window.activeTabId,
        },
        dragState: null,
        dragPreview: null,
      };
    }),

  exitFocusMode: () =>
    set((state) => {
      if (!state.window || !state.focusMode) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: state.focusMode.layoutBeforeFocus,
          activeTabId: state.focusMode.activeTabIdBeforeFocus,
        },
        focusMode: null,
        dragState: null,
        dragPreview: null,
      };
    }),

  toggleFocusMode: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId]) {
        return state;
      }

      if (!state.focusMode) {
        return {
          window: {
            ...state.window,
            layout: createLeafLayout(tabId),
            activeTabId: tabId,
          },
          focusMode: {
            focusedTabId: tabId,
            layoutBeforeFocus: state.window.layout,
            activeTabIdBeforeFocus: state.window.activeTabId,
          },
          dragState: null,
          dragPreview: null,
        };
      }

      if (state.focusMode.focusedTabId !== tabId) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: state.focusMode.layoutBeforeFocus,
          activeTabId: state.focusMode.activeTabIdBeforeFocus,
        },
        focusMode: null,
        dragState: null,
        dragPreview: null,
      };
    }),

  updateTabCwd: (tabId, cwd) =>
    set((state) =>
      updateTabState(state, tabId, (tab) => {
        if (!cwd || tab.cwd === cwd) {
          return tab;
        }

        return {
          ...tab,
          cwd,
        };
      }),
    ),

  attachSession: (tabId, sessionId, shell, cwd) =>
    set((state) =>
      updateTabState(state, tabId, (tab) => ({
        ...tab,
        sessionId,
        shell,
        cwd,
        status: "running",
        error: undefined,
        exitCode: null,
        signal: null,
      })),
    ),

  markTabExited: (tabId, exitCode, signal, error) =>
    set((state) =>
      updateTabState(state, tabId, (tab) => ({
        ...tab,
        status: error ? "error" : "exited",
        error: error ?? undefined,
        exitCode,
        signal,
        sessionId: undefined,
      })),
    ),

  markTabError: (tabId, message) =>
    set((state) =>
      updateTabState(state, tabId, (tab) => ({
        ...tab,
        status: "error",
        error: message,
        sessionId: undefined,
      })),
    ),

  restartTab: (tabId) =>
    set((state) =>
      updateTabState(state, tabId, (tab) => ({
        ...tab,
        status: "starting",
        error: undefined,
        exitCode: null,
        signal: null,
        sessionId: undefined,
      })),
    ),
}));

export function selectActiveTab(state: Pick<WorkspaceStore, "window">): TabModel | null {
  if (!state.window) {
    return null;
  }

  return state.window.tabs[state.window.activeTabId] ?? null;
}

export function selectWindowForPersistence(state: Pick<WorkspaceStore, "window" | "focusMode">): WindowModel | null {
  if (!state.window) {
    return null;
  }

  if (!state.focusMode) {
    return state.window;
  }

  return {
    ...state.window,
    layout: state.focusMode.layoutBeforeFocus,
    activeTabId: state.focusMode.activeTabIdBeforeFocus,
  };
}

function splitWindowTab(state: WorkspaceStore, tabId: string, axis: SplitAxis): Partial<WorkspaceStore> | WorkspaceStore {
  if (!state.window?.tabs[tabId]) {
    return state;
  }

  const nextTabNumber = state.window.nextTabNumber;
  const newTabId = `tab:${nextTabNumber}`;
  const sourceTab = state.window.tabs[tabId];

  return {
    window: {
      ...state.window,
      layout: splitLeaf(state.window.layout, tabId, newTabId, axis),
      tabs: {
        ...state.window.tabs,
        [newTabId]: createTabModel(newTabId, `Tab ${nextTabNumber}`, sourceTab.shell, sourceTab.cwd),
      },
      activeTabId: newTabId,
      nextTabNumber: nextTabNumber + 1,
    },
    dragState: null,
    dragPreview: null,
    noteEditorTabId: null,
    voiceBypassTabId: null,
  };
}

function createBootstrapWindowModel(shell: string, cwd: string): WindowModel {
  return {
    layout: createLeafLayout("tab:1"),
    tabs: {
      "tab:1": createTabModel("tab:1", "Tab 1", shell, cwd),
    },
    activeTabId: "tab:1",
    nextTabNumber: 2,
  };
}

function createTabModel(tabId: string, title: string, shell: string, cwd: string): TabModel {
  return {
    tabId,
    title,
    shell,
    cwd,
    status: "starting",
    sessionId: undefined,
    error: undefined,
    exitCode: null,
    signal: null,
  };
}

function updateTabState(
  state: WorkspaceStore,
  tabId: string,
  updater: (tab: TabModel) => TabModel,
): Partial<WorkspaceStore> | WorkspaceStore {
  if (!state.window?.tabs[tabId]) {
    return state;
  }

  const currentTab = state.window.tabs[tabId];
  const nextTab = updater(currentTab);
  if (nextTab === currentTab) {
    return state;
  }

  return {
    window: {
      ...state.window,
      tabs: {
        ...state.window.tabs,
        [tabId]: nextTab,
      },
    },
  };
}

function createPaneMinimumResolver(): PaneMinimumResolver {
  return (paneId, placement) => {
    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, paneId);
    const minimumHeight =
      tabState?.mode === "dialog" && placement.touchesWindowBottom
        ? MIN_BOUNDARY_PANE_HEIGHT_PX
        : MIN_INTERIOR_PANE_HEIGHT_PX;

    return {
      minWidthPx: MIN_PANE_WIDTH_PX,
      minHeightPx: minimumHeight,
    };
  };
}
