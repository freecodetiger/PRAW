import { describe, expect, it } from "vitest";

import { resolveSessionTabRef, type SessionTabRef } from "./runtime-session-routing";

describe("runtime session routing", () => {
  it("routes output to attached sessions first", () => {
    const attached = new Map<string, SessionTabRef>([
      ["session:attached", { tabId: "tab:1" }],
    ]);
    const pending = new Map<string, SessionTabRef>([
      ["session:attached", { tabId: "tab:2" }],
    ]);

    expect(resolveSessionTabRef("session:attached", attached, pending)).toEqual({
      tabId: "tab:1",
    });
  });

  it("routes output for sessions that are still pending attachment", () => {
    const attached = new Map<string, SessionTabRef>();
    const pending = new Map<string, SessionTabRef>([
      ["session:pending", { tabId: "tab:1" }],
    ]);

    expect(resolveSessionTabRef("session:pending", attached, pending)).toEqual({
      tabId: "tab:1",
    });
  });

  it("returns null when a session cannot be matched", () => {
    expect(resolveSessionTabRef("session:missing", new Map(), new Map())).toBeNull();
  });
});
