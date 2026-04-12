import { describe, expect, it } from "vitest";

import {
  buildClassicTerminalWorkflowResetSequence,
  installClassicTerminalProtocolGuards,
  shouldSwallowCsiQuery,
  shouldSwallowOscColorQuery,
} from "./classic-terminal-guards";

describe("classic terminal guards", () => {
  it("suppresses OSC special color queries but allows explicit color sets", () => {
    expect(shouldSwallowOscColorQuery("?")).toBe(true);
    expect(shouldSwallowOscColorQuery("?;?")).toBe(true);
    expect(shouldSwallowOscColorQuery("rgb:ffff/ffff/ffff")).toBe(false);
    expect(shouldSwallowOscColorQuery("#ffffff")).toBe(false);
  });

  it("suppresses device and cursor query CSI sequences that leak back into the shell line", () => {
    expect(shouldSwallowCsiQuery("c", [0])).toBe(true);
    expect(shouldSwallowCsiQuery("c", [])).toBe(true);
    expect(shouldSwallowCsiQuery(">c", [0])).toBe(true);
    expect(shouldSwallowCsiQuery("n", [5])).toBe(true);
    expect(shouldSwallowCsiQuery("n", [6])).toBe(true);
    expect(shouldSwallowCsiQuery("?n", [6])).toBe(true);
    expect(shouldSwallowCsiQuery("?n", [15])).toBe(true);
    expect(shouldSwallowCsiQuery("?h", [1004])).toBe(true);
    expect(shouldSwallowCsiQuery("?l", [1004])).toBe(true);
    expect(shouldSwallowCsiQuery("m", [31])).toBe(false);
    expect(shouldSwallowCsiQuery("n", [2])).toBe(false);
  });

  it("registers query guards for OSC and CSI responses used by agent CLIs", () => {
    const oscHandlers = new Map<number, (data: string) => boolean | Promise<boolean>>();
    const csiHandlers = new Map<string, (params: (number | number[])[]) => boolean | Promise<boolean>>();
    const terminal = {
      parser: {
        registerOscHandler: (ident: number, callback: (data: string) => boolean | Promise<boolean>) => {
          oscHandlers.set(ident, callback);
          return {
            dispose: () => {
              oscHandlers.delete(ident);
            },
          };
        },
        registerCsiHandler: (
          identifier: { prefix?: string; final: string },
          callback: (params: (number | number[])[]) => boolean | Promise<boolean>,
        ) => {
          const key = `${identifier.prefix ?? ""}${identifier.final}`;
          csiHandlers.set(key, callback);
          return {
            dispose: () => {
              csiHandlers.delete(key);
            },
          };
        },
      },
    };

    const dispose = installClassicTerminalProtocolGuards(terminal);

    expect(oscHandlers.get(10)?.("?")).toBe(true);
    expect(csiHandlers.get("c")?.([])).toBe(true);
    expect(csiHandlers.get(">c")?.([0])).toBe(true);
    expect(csiHandlers.get("n")?.([6])).toBe(true);
    expect(csiHandlers.get("?n")?.([6])).toBe(true);
    expect(csiHandlers.get("?h")?.([1004])).toBe(true);
    expect(csiHandlers.get("?l")?.([1004])).toBe(true);
    expect(csiHandlers.get("n")?.([2])).toBe(false);

    dispose();
    expect(oscHandlers.size).toBe(0);
    expect(csiHandlers.size).toBe(0);
  });

  it("builds a reset sequence that restores classic terminal mouse selection", () => {
    expect(buildClassicTerminalWorkflowResetSequence()).toBe(
      "\u001b[0m\u001b[?1l\u001b[?9l\u001b[?25h\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1004l\u001b[?1005l\u001b[?1006l\u001b[?1015l\u001b[?1016l\u001b[?1047l\u001b[?1048l\u001b[?1049l\u001b[?2004l",
    );
  });
});
