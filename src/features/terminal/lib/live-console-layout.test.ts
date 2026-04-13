import { describe, expect, it } from "vitest";

import { resolveLiveConsoleLayout } from "./live-console-layout";

describe("live console layout", () => {
  it("expands to the default readable height for ordinary panes", () => {
    expect(resolveLiveConsoleLayout({ paneHeight: 720 })).toEqual({
      heightPx: 248,
      compact: false,
    });
  });

  it("enters compact mode when the pane is too short", () => {
    expect(resolveLiveConsoleLayout({ paneHeight: 340 })).toEqual({
      heightPx: 136,
      compact: true,
    });
  });
});
