import { useEffect, useRef, useState } from "react";

import type { LayoutFrame } from "../../../domain/layout/geometry";
import { useWorkspaceShortcuts } from "../hooks/useWorkspaceShortcuts";
import { LayoutTree } from "./LayoutTree";
import { useWorkspaceStore } from "../state/workspace-store";

export function TerminalWorkspace() {
  const windowModel = useWorkspaceStore((state) => state.window);
  const focusAdjacentTab = useWorkspaceStore((state) => state.focusAdjacentTab);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<LayoutFrame>({
    widthPx: 0,
    heightPx: 0,
  });

  useWorkspaceShortcuts({
    focusAdjacentTab,
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
    <section className="workspace">
      <div ref={canvasRef} className="workspace__canvas">
        <LayoutTree node={windowModel.layout} frame={frame} />
      </div>
    </section>
  );
}
