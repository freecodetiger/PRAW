import type { DialogPhase, DialogState } from "../../../domain/terminal/dialog";
import { resolveLiveConsoleLayout } from "./live-console-layout";

interface ResolveDialogSurfaceModelInput {
  paneHeight: number;
  paneState: Pick<DialogState, "dialogPhase" | "activeCommandBlockId">;
}

interface LiveConsoleSurfaceModel {
  blockId: string;
  compact: boolean;
  heightPx: number;
}

export interface DialogSurfaceModel {
  phase: DialogPhase;
  idleComposerVisible: boolean;
  liveConsole: LiveConsoleSurfaceModel | null;
}

export function resolveDialogSurfaceModel({
  paneHeight,
  paneState,
}: ResolveDialogSurfaceModelInput): DialogSurfaceModel {
  if (paneState.dialogPhase === "live-console" && paneState.activeCommandBlockId) {
    const layout = resolveLiveConsoleLayout({ paneHeight });

    return {
      phase: "live-console",
      idleComposerVisible: false,
      liveConsole: {
        blockId: paneState.activeCommandBlockId,
        compact: layout.compact,
        heightPx: layout.heightPx,
      },
    };
  }

  if (paneState.dialogPhase === "classic-handoff") {
    return {
      phase: "classic-handoff",
      idleComposerVisible: false,
      liveConsole: null,
    };
  }

  return {
    phase: "idle",
    idleComposerVisible: true,
    liveConsole: null,
  };
}
