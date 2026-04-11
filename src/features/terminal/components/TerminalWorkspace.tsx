import { useEffect, useMemo, useState } from "react";

import { collectLeafPaneIds } from "../../../domain/layout/tree";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useWorkspaceShortcuts } from "../hooks/useWorkspaceShortcuts";
import { LayoutTree } from "./LayoutTree";
import { DEFAULT_PANE_ID, selectActiveTab, selectActiveWorkspace, useWorkspaceStore } from "../state/workspace-store";

export function TerminalWorkspace() {
  const windowModel = useWorkspaceStore((state) => state.window);
  const dragState = useWorkspaceStore((state) => state.dragState);
  const dragPreview = useWorkspaceStore((state) => state.dragPreview);
  const focusAdjacentPane = useWorkspaceStore((state) => state.focusAdjacentPane);
  const createTab = useWorkspaceStore((state) => state.createTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const terminalConfig = useAppConfigStore((state) => state.config.terminal);
  const activeTab = useWorkspaceStore(selectActiveTab);
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabTitleDraft, setTabTitleDraft] = useState("");
  const paneCount = workspace ? collectLeafPaneIds(workspace.layout).length : 0;

  const tabDefaults = useMemo(
    () => ({
      shell: terminalConfig.defaultShell,
      cwd: terminalConfig.defaultCwd,
    }),
    [terminalConfig.defaultCwd, terminalConfig.defaultShell],
  );

  useWorkspaceShortcuts({
    windowModel,
    createTab,
    closeTab,
    focusAdjacentPane,
    startRenameActiveTab: () => {
      if (!activeTab) {
        return;
      }

      setEditingTabId(activeTab.tabId);
      setTabTitleDraft(activeTab.title);
    },
    tabDefaults,
  });

  useEffect(() => {
    if (!windowModel || !editingTabId || windowModel.tabs[editingTabId]) {
      return;
    }

    setEditingTabId(null);
    setTabTitleDraft("");
  }, [editingTabId, windowModel]);

  if (!windowModel || !workspace || !activeTab) {
    return <section className="empty-state">Bootstrapping workspace…</section>;
  }

  const activePane = workspace.panes[workspace.activePaneId];
  const commitRename = () => {
    if (!editingTabId) {
      return;
    }

    renameTab(editingTabId, tabTitleDraft);
    setEditingTabId(null);
    setTabTitleDraft("");
  };

  return (
    <section className="workspace">
      <div className="workspace__toolbar">
        <div>
          <strong>Workspace kernel online</strong>
          <p>
            {windowModel.tabOrder.length} tab · {paneCount} pane · active {activePane?.title ?? DEFAULT_PANE_ID} ·
            layout model owned by the frontend domain layer
          </p>
        </div>

        <div className="workspace__toolbar-actions">
          <span className="status-pill">Ctrl+Alt+Arrow focus</span>
          <span className="status-pill">Ctrl+Shift+T new tab</span>
          <span className="status-pill">F2 rename tab</span>
          <span className="status-pill">Ctrl+Shift+C/V clipboard</span>
          {dragState ? (
            <span className="status-pill status-pill--starting">
              dragging {dragState.sourcePaneId}
              {dragPreview ? ` -> ${dragPreview.targetPaneId}` : ""}
            </span>
          ) : null}
          <span className="status-pill status-pill--running">runtime-buffered sessions</span>
          <button
            className="button"
            type="button"
            onClick={() => createTab(tabDefaults)}
          >
            New Tab
          </button>
        </div>
      </div>

      <div className="tab-strip">
        {windowModel.tabOrder.map((tabId) => {
          const tab = windowModel.tabs[tabId];
          const isActive = tabId === windowModel.activeTabId;
          const isEditing = editingTabId === tabId;

          return (
            <div key={tabId} className={`tab-chip${isActive ? " tab-chip--active" : ""}`}>
              {isEditing ? (
                <input
                  autoFocus
                  className="tab-chip__input"
                  value={tabTitleDraft}
                  onChange={(event) => setTabTitleDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitRename();
                    }

                    if (event.key === "Escape") {
                      setEditingTabId(null);
                      setTabTitleDraft("");
                    }
                  }}
                />
              ) : (
                <button
                  className="tab-chip__label"
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  onDoubleClick={() => {
                    setEditingTabId(tabId);
                    setTabTitleDraft(tab.title);
                  }}
                >
                  {tab.title}
                </button>
              )}
              <button
                className="tab-chip__close"
                type="button"
                disabled={windowModel.tabOrder.length <= 1}
                onClick={() => closeTab(tabId)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="workspace__canvas">
        <LayoutTree tabId={activeTab.tabId} node={workspace.layout} />
      </div>
    </section>
  );
}
