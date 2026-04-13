// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CommandBlock } from "../../../domain/terminal/dialog";
import { DialogTranscript } from "./DialogTranscript";

describe("DialogTranscript", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("does not render a separate exit status line for completed commands", () => {
    const blocks: CommandBlock[] = [
      {
        id: "cmd:1",
        kind: "command",
        cwd: "/workspace",
        command: "ls",
        output: "file-a\nfile-b\n",
        status: "completed",
        interactive: false,
        exitCode: 0,
      },
    ];

    act(() => {
      root.render(
        <DialogTranscript
          blocks={blocks}
          scrollRef={{ current: null }}
          onScroll={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain("/workspace");
    expect(host.textContent).toContain("ls");
    expect(host.textContent).toContain("file-a");
    expect(host.textContent).not.toContain("exit 0");
    expect(host.querySelector(".command-block__status")).toBeNull();
  });
});
