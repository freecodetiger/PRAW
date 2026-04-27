import { useMemo, useState } from "react";

import { countLeaves } from "../../../domain/layout/tree";
import { useAppConfigStore } from "../../config/state/app-config-store";
import {
  selectWorkspaceCollectionForPersistence,
  useWorkspaceStore,
} from "../../terminal/state/workspace-store";

export function WorkspaceSwitcherPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const config = useAppConfigStore((state) => state.config);
  const rawCollection = useWorkspaceStore((state) => state.workspaceCollection);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const windowModel = useWorkspaceStore((state) => state.window);
  const focusMode = useWorkspaceStore((state) => state.focusMode);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const switchWorkspace = useWorkspaceStore((state) => state.switchWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
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

  const commitTitle = (workspaceId: string, title: string) => {
    renameWorkspace(workspaceId, title);
    setDraftTitles((current) => {
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  };

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
        </button>
      </nav>

      {isOpen ? <div className="workspace-switcher-backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" /> : null}

      <aside className={`workspace-switcher-panel${isOpen ? " workspace-switcher-panel--open" : ""}`} aria-label="Workspaces">
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
            const activeTab = workspace.window.tabs[workspace.window.activeTabId];
            const paneCount = countLeaves(workspace.window.layout);
            const isActive = workspace.workspaceId === activeWorkspaceId;
            return (
              <section
                className={`workspace-switcher-item${isActive ? " workspace-switcher-item--active" : ""}`}
                key={workspace.workspaceId}
              >
                <button
                  className="workspace-switcher-item__target"
                  type="button"
                  data-workspace-id={workspace.workspaceId}
                  onClick={() => switchWorkspace(workspace.workspaceId)}
                >
                  <span>{isActive ? "Active" : "Switch"}</span>
                  <small>
                    {paneCount} {paneCount === 1 ? "pane" : "panes"} · {activeTab?.cwd ?? "~"}
                  </small>
                </button>

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
