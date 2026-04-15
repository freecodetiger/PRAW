// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTerminalSemanticEvent,
  createDialogState,
  submitDialogCommand,
} from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { DialogTerminalSurface } from "./DialogTerminalSurface";

const observers: MockIntersectionObserver[] = [];
vi.mock("./DialogIdleComposer", () => ({
  DialogIdleComposer: () => <div data-testid="dialog-idle-composer" />,
}));

vi.mock("./LiveCommandConsole", () => ({
  LiveCommandConsole: () => <div data-testid="live-command-console" />,
}));

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root: Element | Document | null;
  rootMargin: string;
  thresholds: number[];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "";
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold ?? 0];
  }

  trigger(isIntersecting: boolean) {
    const target = this.observe.mock.calls[0]?.[0] as Element | undefined;
    if (!target) {
      return;
    }

    const entry = {
      isIntersecting,
      target,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: isIntersecting ? target.getBoundingClientRect() : new DOMRectReadOnly(),
      rootBounds: this.root instanceof Element ? this.root.getBoundingClientRect() : null,
      time: Date.now(),
    } satisfies IntersectionObserverEntry;

    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

function createIdlePaneState() {
  return {
    ...createDialogState("/bin/bash", "/workspace"),
    shell: "/bin/bash",
    parserState: createShellIntegrationParserState(),
  };
}

describe("DialogTerminalSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    observers.length = 0;
    vi.stubGlobal(
      "IntersectionObserver",
      function MockIntersectionObserverConstructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        const observer = new MockIntersectionObserver(callback, options);
        observers.push(observer);
        return observer;
      },
    );

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it("does not render AI quick prompt affordances because AI workflow uses a dedicated surface", () => {
    const started = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "codex", () => "cmd:codex");
    const paneState = {
      ...applyTerminalSemanticEvent(started, {
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry: "codex",
      }),
      shell: "/bin/bash",
      parserState: createShellIntegrationParserState(),
    };

    act(() => {
      root.render(
        <DialogTerminalSurface
          paneState={paneState}
          status="running"
          tabId="tab:1"
          sessionId="session-1"
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          onSubmitCommand={() => undefined}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
        />,
      );
    });

    expect(host.querySelector('button[aria-label="Open AI quick prompt"]')).toBeNull();
    expect(host.querySelector('[aria-label="AI prompt overlay"]')).toBeNull();
  });

  it("hides the jump button as soon as the bottom sentinel becomes visible", () => {
    const paneState = {
      ...createIdlePaneState(),
      blocks: [
        {
          id: "cmd:1",
          kind: "command" as const,
          cwd: "/workspace",
          command: "ls",
          output: "file-a\nfile-b\n",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
      ],
    };

    act(() => {
      root.render(
        <DialogTerminalSurface
          paneState={paneState}
          status="running"
          tabId="tab:1"
          sessionId="session-1"
          
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          onSubmitCommand={() => undefined}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
        />,
      );
    });

    expect(observers).toHaveLength(1);

    act(() => {
      observers[0]?.trigger(false);
    });

    expect(host.textContent).toContain("Jump to latest");

    act(() => {
      observers[0]?.trigger(true);
    });

    expect(host.textContent).not.toContain("Jump to latest");
  });
});
