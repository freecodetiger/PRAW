import { useEffect, useRef, useState } from "react";

import type { LayoutFrame } from "../../../domain/layout/geometry";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useWorkspaceShortcuts } from "../hooks/useWorkspaceShortcuts";
import { LayoutTree } from "./LayoutTree";
import { useWorkspaceStore } from "../state/workspace-store";

export function TerminalWorkspace() {
  const windowModel = useWorkspaceStore((state) => state.window);
  const activeTabId = useWorkspaceStore((state) => state.window?.activeTabId ?? null);
  const focusAdjacentTab = useWorkspaceStore((state) => state.focusAdjacentTab);
  const splitActiveTab = useWorkspaceStore((state) => state.splitActiveTab);
  const requestEditNoteForActiveTab = useWorkspaceStore((state) => state.requestEditNoteForActiveTab);
  const requestAiVoiceBypassForActiveTab = useWorkspaceStore((state) => state.requestAiVoiceBypassForActiveTab);
  const toggleFocusMode = useWorkspaceStore((state) => state.toggleFocusMode);
  const isFocusModeActive = useWorkspaceStore((state) => state.focusMode !== null);
  const shortcuts = useAppConfigStore((state) => state.config.terminal.shortcuts);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<LayoutFrame>({
    widthPx: 0,
    heightPx: 0,
  });

  useWorkspaceShortcuts({
    focusAdjacentTab,
    splitActiveTab,
    requestEditNoteForActiveTab,
    toggleAiVoiceBypass: () => {
      requestAiVoiceBypassForActiveTab();
    },
    toggleFocusPane: () => {
      if (!activeTabId) {
        return;
      }

      toggleFocusMode(activeTabId);
    },
    shortcuts,
  });

  useEffect(() => {
    if (!windowModel || !canvasRef.current) {
      return;
    }

    const element = canvasRef.current;
    const updateFrame = () => {
      setFrame({
        widthPx: element.clientWidth,
        heightPx: element.clientHeight,
      });
    };

    updateFrame();

    const observer = new ResizeObserver(() => {
      updateFrame();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [windowModel]);

  if (!windowModel) {
    return <section className="empty-state">Bootstrapping workspace…</section>;
  }

  return (
    <section className={`workspace${isFocusModeActive ? " workspace--focus-mode" : ""}`}>
      <div ref={canvasRef} className="workspace__canvas">
        <LayoutTree node={windowModel.layout} frame={frame} />
      </div>
    </section>
  );
}
