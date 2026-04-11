import { describe, expect, it } from "vitest";

import { resolveSessionPaneRef, type SessionPaneRef } from "./runtime-session-routing";

describe("runtime session routing", () => {
  it("routes output to attached sessions first", () => {
    const attached = new Map<string, SessionPaneRef>([
      ["session:attached", { tabId: "tab:1", paneId: "pane:main" }],
    ]);
    const pending = new Map<string, SessionPaneRef>([
      ["session:attached", { tabId: "tab:2", paneId: "pane:2" }],
    ]);

    expect(resolveSessionPaneRef("session:attached", attached, pending)).toEqual({
      tabId: "tab:1",
      paneId: "pane:main",
    });
  });

  it("routes output for sessions that are still pending attachment", () => {
    const attached = new Map<string, SessionPaneRef>();
    const pending = new Map<string, SessionPaneRef>([
      ["session:pending", { tabId: "tab:1", paneId: "pane:main" }],
    ]);

    expect(resolveSessionPaneRef("session:pending", attached, pending)).toEqual({
      tabId: "tab:1",
      paneId: "pane:main",
    });
  });

  it("returns null when a session cannot be matched", () => {
    expect(resolveSessionPaneRef("session:missing", new Map(), new Map())).toBeNull();
  });
});
