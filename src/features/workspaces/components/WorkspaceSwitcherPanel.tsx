import { useMemo, useState, type CSSProperties } from "react";

import { countLeaves } from "../../../domain/layout/tree";
import type { WorkspaceEntry } from "../../../domain/workspaces/types";
import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  selectWorkspaceCollectionForPersistence,
  useWorkspaceStore,
} from "../../terminal/state/workspace-store";
import {
  selectTerminalTabState,
  useTerminalViewStore,
  type TerminalTabViewState,
} from "../../terminal/state/terminal-view-store";
import { exportTerminalArchive } from "../../terminal/lib/terminal-registry";

export function WorkspaceSwitcherPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [pendingDeleteWorkspaceId, setPendingDeleteWorkspaceId] = useState<string | null>(null);
  const config = useAppConfigStore((state) => state.config);
  const rawCollection = useWorkspaceStore((state) => state.workspaceCollection);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const windowModel = useWorkspaceStore((state) => state.window);
  const focusMode = useWorkspaceStore((state) => state.focusMode);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const switchWorkspace = useWorkspaceStore((state) => state.switchWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const tabStates = useTerminalViewStore((state) => state.tabStates);
  const collection = useMemo(
    () =>
      selectWorkspaceCollectionForPersistence({
        workspaceCollection: rawCollection,
        activeWorkspaceId,
        window: windowModel,
        focusMode,
      }),
    [activeWorkspaceId, focusMode, rawCollection, windowModel],
  );

  const workspaces = collection?.workspaces ?? [];

  const create = () => {
    createWorkspace({
      shell: config.terminal.defaultShell,
      cwd: config.terminal.defaultCwd,
    });
  };

  const remove = (workspace: WorkspaceEntry) => {
    if (workspaceRequiresDeleteConfirmation(workspace, tabStates)) {
      setPendingDeleteWorkspaceId(workspace.workspaceId);
      return;
    }

    setPendingDeleteWorkspaceId(null);
    deleteWorkspace(workspace.workspaceId, {
      shell: config.terminal.defaultShell,
      cwd: config.terminal.defaultCwd,
    });
  };

  const confirmDelete = () => {
    const workspace = workspaces.find((entry) => entry.workspaceId === pendingDeleteWorkspaceId);
    if (!workspace) {
      setPendingDeleteWorkspaceId(null);
      return;
    }

    setPendingDeleteWorkspaceId(null);
    deleteWorkspace(workspace.workspaceId, {
      shell: config.terminal.defaultShell,
      cwd: config.terminal.defaultCwd,
    });
  };

  const commitTitle = (workspaceId: string, title: string) => {
    renameWorkspace(workspaceId, title);
    setDraftTitles((current) => {
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  };
  const panelStyle = {
    "--ai-theme-color": config.ai.themeColor,
  } as CSSProperties;

  return (
    <>
      <nav className="workspace-rail" aria-label="Workspaces">
        <button
          className={`workspace-rail__button${isOpen ? " workspace-rail__button--active" : ""}`}
          type="button"
          aria-label="Open workspaces"
          title="Workspaces"
          onClick={() => setIsOpen((value) => !value)}
        >
          <span className="workspace-rail__logo" aria-hidden="true">
            <span className="workspace-rail__logo-spine" />
            <span className="workspace-rail__logo-lines">
              <span />
              <span />
              <span />
            </span>
          </span>
          <span className="workspace-rail__count">{workspaces.length}</span>
        </button>
      </nav>

      {isOpen ? <div className="workspace-switcher-backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" /> : null}

      <aside
        className={`workspace-switcher-panel${isOpen ? " workspace-switcher-panel--open" : ""}`}
        aria-label="Workspaces"
        style={panelStyle}
      >
        <div className="workspace-switcher-panel__header">
          <div>
            <p className="eyebrow">Workspaces</p>
            <strong>Running Spaces</strong>
          </div>
          <button className="button button--ghost" type="button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>

        <div className="workspace-switcher-panel__list">
          {workspaces.map((workspace) => {
            const isActive = workspace.workspaceId === activeWorkspaceId;
            const summary = getWorkspaceSummary(workspace, tabStates);
            const isConfirmingDelete = pendingDeleteWorkspaceId === workspace.workspaceId;
            return (
              <section
                className={`workspace-switcher-item${isActive ? " workspace-switcher-item--active" : ""}${
                  isConfirmingDelete ? " workspace-switcher-item--confirming-delete" : ""
                }`}
                key={workspace.workspaceId}
              >
                <div className="workspace-switcher-item__row">
                  <button
                    className="workspace-switcher-item__target"
                    type="button"
                    data-workspace-id={workspace.workspaceId}
                    onClick={() => switchWorkspace(workspace.workspaceId)}
                  >
                    <span className="workspace-switcher-item__headline">
                      <span>{isActive ? "Active" : "Switch"}</span>
                      {summary.command ? <span className="workspace-switcher-item__command">{summary.command}</span> : null}
                    </span>
                    <small className="workspace-switcher-item__cwd">{summary.cwd}</small>
                  </button>

                  {isConfirmingDelete ? (
                    <div
                      className="workspace-switcher-item__inline-confirm"
                      data-confirm-delete-workspace-id={workspace.workspaceId}
                    >
                      <button
                        className="workspace-switcher-item__confirm-delete"
                        type="button"
                        aria-label="Confirm workspace deletion"
                        title="Delete"
                        onClick={confirmDelete}
                      >
                        Confirm
                      </button>
                      <button
                        className="workspace-switcher-item__confirm-cancel"
                        type="button"
                        aria-label="Cancel workspace deletion"
                        title="Cancel"
                        onClick={() => setPendingDeleteWorkspaceId(null)}
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button
                      className="workspace-switcher-item__delete"
                      type="button"
                      aria-label={`Delete ${workspace.title}`}
                      title={`Delete ${workspace.title}`}
                      onClick={() => remove(workspace)}
                    >
                      <span aria-hidden="true" />
                      <span aria-hidden="true" />
                    </button>
                  )}
                </div>

                <input
                  aria-label={`Rename ${workspace.title}`}
                  value={draftTitles[workspace.workspaceId] ?? workspace.title}
                  onChange={(event) =>
                    setDraftTitles((current) => ({
                      ...current,
                      [workspace.workspaceId]: event.target.value,
                    }))
                  }
                  onBlur={(event) => commitTitle(workspace.workspaceId, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </section>
            );
          })}
        </div>

        <button className="button button--primary" type="button" aria-label="Create workspace" onClick={create}>
          New Workspace
        </button>
      </aside>
    </>
  );
}

function getWorkspaceSummary(
  workspace: WorkspaceEntry,
  tabStates: Record<string, TerminalTabViewState>,
): { cwd: string; command: string | null } {
  const activeTabId = workspace.window.activeTabId;
  const activeTab = workspace.window.tabs[activeTabId];
  const tabState = selectTerminalTabState(tabStates, activeTabId);
  const latestBlockCommand = tabState?.blocks
    .slice()
    .reverse()
    .find((block) => typeof block.command === "string" && block.command.trim().length > 0)?.command;
  const latestHistoryCommand = tabState?.composerHistory.slice().reverse().find((command) => command.trim().length > 0);
  const command = latestBlockCommand ?? latestHistoryCommand;

  return {
    cwd: tabState?.cwd || activeTab?.cwd || "~",
    command: command?.trim() || null,
  };
}

function workspaceRequiresDeleteConfirmation(
  workspace: WorkspaceEntry,
  tabStates: Record<string, TerminalTabViewState>,
): boolean {
  if (countLeaves(workspace.window.layout) !== 1) {
    return true;
  }

  return Object.values(workspace.window.tabs).some((tab) => {
    if (tab.note || tab.status === "error" || tab.status === "exited") {
      return true;
    }

    const tabState = selectTerminalTabState(tabStates, tab.tabId);
    const terminalArchive = exportTerminalArchive(tab.tabId)?.trim() ?? "";
    return (
      (tabState?.blocks.length ?? 0) > 0 ||
      (tabState?.composerHistory.length ?? 0) > 0 ||
      terminalArchive.length > 0
    );
  });
}
