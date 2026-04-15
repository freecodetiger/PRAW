// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiTranscript } from "./AiTranscript";

describe("AiTranscript", () => {
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

  it("renders output text without leaking raw ANSI escape sequences", () => {
    const scrollRef = { current: null };
    const bottomRef = { current: null };

    act(() => {
      root.render(
        <AiTranscript
          entries={[
            {
              id: "output:1",
              kind: "output",
              text: "\u001b[32mWelcome to Codex\u001b[0m",
              status: "streaming",
            },
          ]}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          onScroll={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain("Welcome to Codex");
    expect(host.textContent).not.toContain("\u001b[32m");
  });

  it("copies an assistant entry from an explicit transcript action", async () => {
    const scrollRef = { current: null };
    const bottomRef = { current: null };

    await act(async () => {
      root.render(
        <AiTranscript
          entries={[
            {
              id: "output:1",
              kind: "output",
              text: "pong",
              status: "completed",
            },
          ]}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          onScroll={() => undefined}
        />,
      );
    });

    const copyButton = host.querySelector('button[aria-label="Copy transcript entry"]');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("pong");
  });

  it("shows a transcript context menu for copying selected AI text", async () => {
    const scrollRef = { current: null };
    const bottomRef = { current: null };

    await act(async () => {
      root.render(
        <AiTranscript
          entries={[
            {
              id: "output:1",
              kind: "output",
              text: "pong",
              status: "completed",
            },
          ]}
          scrollRef={scrollRef}
          bottomRef={bottomRef}
          onScroll={() => undefined}
        />,
      );
    });

    const body = host.querySelector(".ai-workflow__entry-body");
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "pong",
      anchorNode: body?.firstChild ?? body,
      focusNode: body?.firstChild ?? body,
    } as Selection);

    await act(async () => {
      body?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 18, clientY: 24 }));
    });

    expect(host.textContent).toContain("Copy selection");

    const copySelectionButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy selection"),
    );

    await act(async () => {
      copySelectionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("pong");
  });
});
