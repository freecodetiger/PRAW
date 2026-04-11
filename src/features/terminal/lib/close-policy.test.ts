import { describe, expect, it } from "vitest";

import type { DialogState } from "../../../domain/terminal/dialog";
import type { TabModel } from "../../../domain/window/types";
import { shouldConfirmBeforeClosingTab } from "./close-policy";

function createTab(overrides: Partial<TabModel> = {}): TabModel {
  return {
    tabId: "tab:1",
    title: "Tab 1",
    shell: "/bin/bash",
    cwd: "~",
    status: "starting",
    exitCode: null,
    signal: null,
    ...overrides,
  };
}

function createDialogState(overrides: Partial<DialogState> = {}): DialogState {
  return {
    mode: "dialog",
    modeSource: "default",
    presentation: "default",
    shellIntegration: "supported",
    cwd: "~",
    blocks: [],
    activeCommandBlockId: null,
    composerHistory: [],
    ...overrides,
  };
}

describe("shouldConfirmBeforeClosingTab", () => {
  it("requires confirmation only when a supported shell tab still has a running command", () => {
    expect(
      shouldConfirmBeforeClosingTab(
        createTab({
          status: "running",
          sessionId: "session:1",
        }),
        createDialogState({
          activeCommandBlockId: "cmd:1",
        }),
      ),
    ).toBe(true);
  });

  it("does not require confirmation for an idle running shell with no active command", () => {
    expect(
      shouldConfirmBeforeClosingTab(
        createTab({
          status: "running",
          sessionId: "session:1",
        }),
        createDialogState({
          activeCommandBlockId: null,
        }),
      ),
    ).toBe(false);
  });

  it("does not require confirmation for exited tabs", () => {
    expect(
      shouldConfirmBeforeClosingTab(
        createTab({
          status: "exited",
          sessionId: undefined,
          exitCode: 0,
        }),
      ),
    ).toBe(false);
  });
});
