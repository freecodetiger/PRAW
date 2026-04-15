// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandBlock } from "../../../domain/terminal/dialog";
import { DialogTranscript } from "./DialogTranscript";

describe("DialogTranscript", () => {
  let host: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });
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

  it("copies an entire command block from an explicit block action", async () => {
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

    await act(async () => {
      root.render(
        <DialogTranscript
          blocks={blocks}
          scrollRef={{ current: null }}
          onScroll={() => undefined}
        />,
      );
    });

    const copyButton = host.querySelector('button[aria-label="Copy command block"]');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("$ ls\nfile-a\nfile-b\n");
  });

  it("copies command blocks as plain text without terminal control sequences", async () => {
    const blocks: CommandBlock[] = [
      {
        id: "cmd:color",
        kind: "command",
        cwd: "/workspace",
        command: "printf color",
        output: "\u001b[31mred\u001b[0m\n\u001b]10;rgb:ffff/ffff/ffff\u001b\\plain\n",
        status: "completed",
        interactive: false,
        exitCode: 0,
      },
    ];

    await act(async () => {
      root.render(
        <DialogTranscript
          blocks={blocks}
          scrollRef={{ current: null }}
          onScroll={() => undefined}
        />,
      );
    });

    const copyButton = host.querySelector('button[aria-label="Copy command block"]');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("$ printf color\nred\nplain\n");
  });

  it("shows a transcript context menu for copying selected text", async () => {
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

    await act(async () => {
      root.render(
        <DialogTranscript
          blocks={blocks}
          scrollRef={{ current: null }}
          onScroll={() => undefined}
        />,
      );
    });

    const output = host.querySelector(".command-block__output");
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "file-a",
      anchorNode: output?.firstChild ?? output,
      focusNode: output?.firstChild ?? output,
    } as Selection);

    await act(async () => {
      output?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
    });

    expect(host.textContent).toContain("Copy selection");

    const copySelectionButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy selection"),
    );

    await act(async () => {
      copySelectionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("file-a");
  });
});
