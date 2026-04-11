import { describe, expect, it } from "vitest";

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

describe("shouldConfirmBeforeClosingTab", () => {
  it("requires confirmation for running tabs with an active session", () => {
    expect(
      shouldConfirmBeforeClosingTab(
        createTab({
          status: "running",
          sessionId: "session:1",
        }),
      ),
    ).toBe(true);
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
