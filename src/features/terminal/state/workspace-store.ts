import { create } from "zustand";

import {
  applyPaneDragPreview,
  createPaneDragPreview,
  countLeaves,
  createLeafLayout,
  findAdjacentPaneId,
  getFirstLeafPaneId,
  removePane,
  setSplitRatio,
  splitPane as splitLayoutPane,
} from "../../../domain/layout/tree";
import type { FocusDirection, PaneDragPreview, PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { fromWindowSnapshot, type WindowSnapshot } from "../../../domain/window/snapshot";
import type { TabModel, WindowModel } from "../../../domain/window/types";
import type { WorkspaceModel } from "../../../domain/workspace/types";

export const DEFAULT_PANE_ID = "pane:main";

interface BootstrapWindowOptions {
  shell: string;
  cwd: string;
}

interface CreateTabOptions {
  shell: string;
  cwd: string;
}

export type CreateTabRequest = CreateTabOptions;

interface WorkspaceStore {
  window: WindowModel | null;
  dragState: { sourceTabId: string; sourcePaneId: string } | null;
  dragPreview: PaneDragPreview | null;
  bootstrapWindow: (options: BootstrapWindowOptions) => void;
  hydrateWindow: (snapshot: WindowSnapshot) => void;
  createTab: (options: CreateTabOptions) => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  closeTab: (tabId: string) => void;
  setActivePane: (paneId: string) => void;
  splitPane: (paneId: string, axis: SplitAxis) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  focusAdjacentPane: (direction: FocusDirection) => void;
  closePane: (paneId: string) => void;
  beginPaneDrag: (paneId: string) => void;
  setDragPreview: (targetPaneId: string, edge: PaneDropEdge) => void;
  applyDragPreview: () => void;
  clearPaneDrag: () => void;
  attachSession: (tabId: string, paneId: string, sessionId: string, shell: string, cwd: string) => void;
  markPaneExited: (
    tabId: string,
    paneId: string,
    exitCode: number | null | undefined,
    signal: string | null | undefined,
    error?: string | null,
  ) => void;
  markPaneError: (tabId: string, paneId: string, message: string) => void;
  restartPane: (tabId: string, paneId: string) => void;
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

  createTab: ({ shell, cwd }) =>
    set((state) => {
      if (!state.window) {
        return state;
      }

      const tabNumber = state.window.nextTabNumber;
      const tabId = `tab:${tabNumber}`;

      return {
        window: {
          ...state.window,
          tabs: {
            ...state.window.tabs,
            [tabId]: createTabModel(tabId, `Tab ${tabNumber}`, shell, cwd),
          },
          tabOrder: [...state.window.tabOrder, tabId],
          activeTabId: tabId,
          nextTabNumber: tabNumber + 1,
        },
        dragState: null,
        dragPreview: null,
      };
    }),

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
        dragState: null,
        dragPreview: null,
      };
    }),

  renameTab: (tabId, title) =>
    set((state) => {
      if (!state.window?.tabs[tabId]) {
        return state;
      }

      const nextTitle = normalizeTabTitle(title, state.window.tabs[tabId].title);
      if (nextTitle === state.window.tabs[tabId].title) {
        return state;
      }

      return {
        window: {
          ...state.window,
          tabs: {
            ...state.window.tabs,
            [tabId]: {
              ...state.window.tabs[tabId],
              title: nextTitle,
            },
          },
        },
      };
    }),

  closeTab: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId] || state.window.tabOrder.length <= 1) {
        return state;
      }

      const tabs = { ...state.window.tabs };
      delete tabs[tabId];
      const tabOrder = state.window.tabOrder.filter((candidate) => candidate !== tabId);
      const closedIndex = state.window.tabOrder.indexOf(tabId);
      const activeTabId =
        state.window.activeTabId === tabId
          ? tabOrder[Math.max(0, Math.min(closedIndex - 1, tabOrder.length - 1))]
          : state.window.activeTabId;

      return {
        window: {
          ...state.window,
          tabs,
          tabOrder,
          activeTabId,
        },
        dragState: state.dragState?.sourceTabId === tabId ? null : state.dragState,
        dragPreview: state.dragState?.sourceTabId === tabId ? null : state.dragPreview,
      };
    }),

  setActivePane: (paneId) =>
    set((state) => updateActiveWorkspaceState(state, (workspace) => {
      if (!workspace.panes[paneId]) {
        return workspace;
      }

      return {
        ...workspace,
        activePaneId: paneId,
      };
    })),

  splitPane: (paneId, axis) =>
    set((state) =>
      updateActiveWorkspaceState(state, (workspace) => {
        if (!workspace.panes[paneId]) {
          return workspace;
        }

        const newPaneNumber = workspace.nextPaneNumber;
        const newPaneId = `pane:${newPaneNumber}`;
        const sourcePane = workspace.panes[paneId];

        return {
          ...workspace,
          layout: splitLayoutPane(workspace.layout, paneId, newPaneId, axis),
          activePaneId: newPaneId,
          nextPaneNumber: newPaneNumber + 1,
          panes: {
            ...workspace.panes,
            [newPaneId]: {
              paneId: newPaneId,
              title: `Pane ${newPaneNumber}`,
              shell: sourcePane.shell,
              cwd: sourcePane.cwd,
              status: "starting",
            },
          },
        };
      }),
    ),

  resizeSplit: (splitId, ratio) =>
    set((state) =>
      updateActiveWorkspaceState(state, (workspace) => ({
        ...workspace,
        layout: setSplitRatio(workspace.layout, splitId, ratio),
      })),
    ),

  focusAdjacentPane: (direction) =>
    set((state) =>
      updateActiveWorkspaceState(state, (workspace) => {
        const nextPaneId = findAdjacentPaneId(workspace.layout, workspace.activePaneId, direction);
        if (!nextPaneId) {
          return workspace;
        }

        return {
          ...workspace,
          activePaneId: nextPaneId,
        };
      }),
    ),

  closePane: (paneId) =>
    set((state) => {
      const activeWorkspace = selectActiveWorkspace(state);
      if (!activeWorkspace || !activeWorkspace.panes[paneId] || countLeaves(activeWorkspace.layout) <= 1) {
        return state;
      }

      const nextLayout = removePane(activeWorkspace.layout, paneId);
      if (!nextLayout) {
        return state;
      }

      const panes = { ...activeWorkspace.panes };
      delete panes[paneId];

      return updateActiveWorkspaceState(
        {
          ...state,
          dragState:
            state.dragState?.sourcePaneId === paneId &&
            state.dragState.sourceTabId === state.window?.activeTabId
              ? null
              : state.dragState,
          dragPreview:
            state.dragPreview?.sourcePaneId === paneId || state.dragPreview?.targetPaneId === paneId
              ? null
              : state.dragPreview,
        },
        () => ({
          ...activeWorkspace,
          layout: nextLayout,
          panes,
          activePaneId:
            activeWorkspace.activePaneId === paneId ? getFirstLeafPaneId(nextLayout) : activeWorkspace.activePaneId,
        }),
      );
    }),

  beginPaneDrag: (paneId) =>
    set((state) => {
      const activeTab = selectActiveTab(state);
      const workspace = activeTab?.workspace;
      if (!activeTab || !workspace?.panes[paneId]) {
        return state;
      }

      return {
        dragState: {
          sourceTabId: activeTab.tabId,
          sourcePaneId: paneId,
        },
        dragPreview: null,
      };
    }),

  setDragPreview: (targetPaneId, edge) =>
    set((state) => {
      const activeTab = selectActiveTab(state);
      const workspace = activeTab?.workspace;
      if (!workspace || !state.dragState || state.dragState.sourceTabId !== activeTab?.tabId) {
        return state;
      }

      return {
        dragPreview: createPaneDragPreview(
          workspace.layout,
          state.dragState.sourcePaneId,
          targetPaneId,
          edge,
        ),
      };
    }),

  applyDragPreview: () =>
    set((state) => {
      const activeTab = selectActiveTab(state);
      const workspace = activeTab?.workspace;
      const dragPreview = state.dragPreview;
      if (!workspace || !dragPreview || !state.dragState || state.dragState.sourceTabId !== activeTab?.tabId) {
        return state;
      }

      const nextState = updateActiveWorkspaceState(state, () => ({
        ...workspace,
        layout: applyPaneDragPreview(workspace.layout, dragPreview),
        activePaneId: dragPreview.sourcePaneId,
      }));

      return {
        ...nextState,
        dragState: null,
        dragPreview: null,
      };
    }),

  clearPaneDrag: () =>
    set(() => ({
      dragState: null,
      dragPreview: null,
    })),

  attachSession: (tabId, paneId, sessionId, shell, cwd) =>
    set((state) =>
      updateTabWorkspaceState(state, tabId, (workspace) => {
        const pane = workspace.panes[paneId];
        if (!pane) {
          return workspace;
        }

        return {
          ...workspace,
          panes: {
            ...workspace.panes,
            [paneId]: {
              ...pane,
              sessionId,
              shell,
              cwd,
              status: "running",
              error: undefined,
              exitCode: null,
              signal: null,
            },
          },
        };
      }),
    ),

  markPaneExited: (tabId, paneId, exitCode, signal, error) =>
    set((state) =>
      updateTabWorkspaceState(state, tabId, (workspace) => {
        const pane = workspace.panes[paneId];
        if (!pane) {
          return workspace;
        }

        return {
          ...workspace,
          panes: {
            ...workspace.panes,
            [paneId]: {
              ...pane,
              status: error ? "error" : "exited",
              error: error ?? undefined,
              exitCode,
              signal,
              sessionId: undefined,
            },
          },
        };
      }),
    ),

  markPaneError: (tabId, paneId, message) =>
    set((state) =>
      updateTabWorkspaceState(state, tabId, (workspace) => {
        const pane = workspace.panes[paneId];
        if (!pane) {
          return workspace;
        }

        return {
          ...workspace,
          panes: {
            ...workspace.panes,
            [paneId]: {
              ...pane,
              status: "error",
              error: message,
              sessionId: undefined,
            },
          },
        };
      }),
    ),

  restartPane: (tabId, paneId) =>
    set((state) =>
      updateTabWorkspaceState(state, tabId, (workspace) => {
        const pane = workspace.panes[paneId];
        if (!pane) {
          return workspace;
        }

        return {
          ...workspace,
          panes: {
            ...workspace.panes,
            [paneId]: {
              ...pane,
              status: "starting",
              error: undefined,
              exitCode: null,
              signal: null,
              sessionId: undefined,
            },
          },
        };
      }),
    ),
}));

export function selectActiveTab(state: Pick<WorkspaceStore, "window">): TabModel | null {
  if (!state.window) {
    return null;
  }

  return state.window.tabs[state.window.activeTabId] ?? null;
}

export function selectActiveWorkspace(state: Pick<WorkspaceStore, "window">): WorkspaceModel | null {
  return selectActiveTab(state)?.workspace ?? null;
}

function createBootstrapWindowModel(shell: string, cwd: string): WindowModel {
  return {
    tabs: {
      "tab:1": createTabModel("tab:1", "Tab 1", shell, cwd),
    },
    tabOrder: ["tab:1"],
    activeTabId: "tab:1",
    nextTabNumber: 2,
  };
}

function createTabModel(tabId: string, title: string, shell: string, cwd: string): TabModel {
  return {
    tabId,
    title,
    workspace: {
      layout: createLeafLayout(DEFAULT_PANE_ID),
      activePaneId: DEFAULT_PANE_ID,
      nextPaneNumber: 2,
      panes: {
        [DEFAULT_PANE_ID]: {
          paneId: DEFAULT_PANE_ID,
          title: "Main",
          shell,
          cwd,
          status: "starting",
        },
      },
    },
  };
}

function normalizeTabTitle(input: string, fallback: string): string {
  const nextTitle = input.trim();
  return nextTitle.length > 0 ? nextTitle : fallback;
}

function updateActiveWorkspaceState(
  state: WorkspaceStore,
  updater: (workspace: WorkspaceModel) => WorkspaceModel,
): Partial<WorkspaceStore> | WorkspaceStore {
  const activeTab = selectActiveTab(state);
  if (!state.window || !activeTab) {
    return state;
  }

  const nextWorkspace = updater(activeTab.workspace);
  if (nextWorkspace === activeTab.workspace) {
    return state;
  }

  return {
    window: {
      ...state.window,
      tabs: {
        ...state.window.tabs,
        [activeTab.tabId]: {
          ...activeTab,
          workspace: nextWorkspace,
        },
      },
    },
  };
}

function updateTabWorkspaceState(
  state: WorkspaceStore,
  tabId: string,
  updater: (workspace: WorkspaceModel) => WorkspaceModel,
): Partial<WorkspaceStore> | WorkspaceStore {
  if (!state.window) {
    return state;
  }

  const tab = state.window.tabs[tabId];
  if (!tab) {
    return state;
  }

  const nextWorkspace = updater(tab.workspace);
  if (nextWorkspace === tab.workspace) {
    return state;
  }

  return {
    window: {
      ...state.window,
      tabs: {
        ...state.window.tabs,
        [tabId]: {
          ...tab,
          workspace: nextWorkspace,
        },
      },
    },
  };
}
