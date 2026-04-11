import { useWorkspaceShortcuts } from "../hooks/useWorkspaceShortcuts";
import { LayoutTree } from "./LayoutTree";
import { useWorkspaceStore } from "../state/workspace-store";

export function TerminalWorkspace() {
  const windowModel = useWorkspaceStore((state) => state.window);
  const focusAdjacentTab = useWorkspaceStore((state) => state.focusAdjacentTab);

  useWorkspaceShortcuts({
    focusAdjacentTab,
  });

  if (!windowModel) {
    return <section className="empty-state">Bootstrapping workspace…</section>;
  }

  return (
    <section className="workspace">
      <div className="workspace__canvas">
        <LayoutTree node={windowModel.layout} />
      </div>
    </section>
  );
}
