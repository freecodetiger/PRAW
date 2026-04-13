import { describe, expect, it } from "vitest";

import { createDialogState, submitDialogCommand } from "../../../domain/terminal/dialog";
import { resolveDialogSurfaceModel } from "./dialog-surface-model";

describe("dialog surface model", () => {
  it("keeps idle panes in one-line composer mode", () => {
    const paneState = createDialogState("/bin/bash", "/workspace");

    expect(resolveDialogSurfaceModel({ paneHeight: 720, paneState })).toEqual({
      phase: "idle",
      idleComposerVisible: true,
      liveConsole: null,
    });
  });

  it("expands the live console for running dialog-owned commands", () => {
    const paneState = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "git push", () => "cmd:push");

    expect(resolveDialogSurfaceModel({ paneHeight: 720, paneState })).toEqual({
      phase: "live-console",
      idleComposerVisible: false,
      liveConsole: {
        blockId: "cmd:push",
        compact: false,
        heightPx: 248,
      },
    });
  });

  it("keeps the live console compact instead of forcing classic mode in short panes", () => {
    const paneState = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "python", () => "cmd:python");

    expect(resolveDialogSurfaceModel({ paneHeight: 340, paneState })).toEqual({
      phase: "live-console",
      idleComposerVisible: false,
      liveConsole: {
        blockId: "cmd:python",
        compact: true,
        heightPx: 136,
      },
    });
  });

  it("hides dialog-owned input surfaces once the pane has handed off to classic", () => {
    const paneState = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "vim notes.txt", () => "cmd:vim");

    expect(resolveDialogSurfaceModel({ paneHeight: 720, paneState })).toEqual({
      phase: "classic-handoff",
      idleComposerVisible: false,
      liveConsole: null,
    });
  });
});
