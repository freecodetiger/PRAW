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
import type { FocusDirection, PaneDragPreview, PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { fromWindowSnapshot, type WindowSnapshot } from "../../../domain/window/snapshot";
import type { TabModel, WindowModel } from "../../../domain/window/types";
import { selectTerminalTabState, useTerminalViewStore } from "./terminal-view-store";

interface BootstrapWindowOptions {
  shell: string;
  cwd: string;
}

interface WorkspaceStore {
  window: WindowModel | null;
  dragState: { sourceTabId: string } | null;
  dragPreview: PaneDragPreview | null;
  bootstrapWindow: (options: BootstrapWindowOptions) => void;
  hydrateWindow: (snapshot: WindowSnapshot) => void;
  setActiveTab: (tabId: string) => void;
  setTabNote: (tabId: string, note: string) => void;
  splitTab: (tabId: string, axis: SplitAxis) => void;
  resizeSplit: (containerId: string, dividerIndex: number, deltaPx: number, frame: LayoutFrame) => void;
  focusAdjacentTab: (direction: FocusDirection) => void;
  closeTab: (tabId: string) => void;
  beginTabDrag: (tabId: string) => void;
  setDragPreview: (targetTabId: string, edge: PaneDropEdge) => void;
  applyDragPreview: () => void;
  clearPaneDrag: () => void;
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
  dragState: null,
  dragPreview: null,

  bootstrapWindow: ({ shell, cwd }) =>
    set(() => ({
      window: createBootstrapWindowModel(shell, cwd),
      dragState: null,
      dragPreview: null,
    })),

  hydrateWindow: (snapshot) =>
    set(() => ({
      window: fromWindowSnapshot(snapshot),
      dragState: null,
      dragPreview: null,
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
      };
    }),

  resizeSplit: (containerId, dividerIndex, deltaPx, frame) =>
    set((state) => {
      if (!state.window || frame.widthPx <= 0 || frame.heightPx <= 0 || deltaPx === 0) {
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
      if (!state.window) {
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
      if (!state.window?.tabs[tabId] || countLeaves(state.window.layout) <= 1) {
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
      if (!state.window?.tabs[tabId]) {
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
      if (!state.window || !state.dragState) {
        return state;
      }

      return {
        dragPreview: createLeafDragPreview(state.window.layout, state.dragState.sourceTabId, targetTabId, edge),
      };
    }),

  applyDragPreview: () =>
    set((state) => {
      if (!state.window || !state.dragPreview) {
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
