// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { appendLiveConsoleOutput, applyShellLifecycleEvent, createDialogState, submitDialogCommand } from "../../../domain/terminal/dialog";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { DialogIdleComposer } from "./DialogIdleComposer";

const { requestAiRecoverySuggestions, requestAiInlineSuggestions, requestLocalCompletion } = vi.hoisted(() => ({
  requestAiRecoverySuggestions: vi.fn(),
  requestAiInlineSuggestions: vi.fn(),
  requestLocalCompletion: vi.fn(),
}));

vi.mock("../../../lib/tauri/ai", () => ({
  requestAiInlineSuggestions,
  requestAiRecoverySuggestions,
}));

vi.mock("../../../lib/tauri/completion", () => ({
  requestLocalCompletion,
}));

function resetConfigStore() {
  useAppConfigStore.setState({
    config: {
      ...DEFAULT_APP_CONFIG,
      ai: {
        ...DEFAULT_APP_CONFIG.ai,
        enabled: true,
        provider: "glm",
        model: "glm-4.7-flash",
        apiKey: "secret-key",
      },
    },
    hydrateConfig: useAppConfigStore.getState().hydrateConfig,
    patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
    patchAiConfig: useAppConfigStore.getState().patchAiConfig,
    patchUiConfig: useAppConfigStore.getState().patchUiConfig,
  });
}

function createFailedPaneState() {
  const started = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "gti sttaus", () => "cmd:1");
  const withOutput = appendLiveConsoleOutput(started, "git: 'sttaus' is not a git command\n");
  const paneState = applyShellLifecycleEvent(withOutput, {
    type: "command-end",
    exitCode: 1,
  });

  return {
    ...paneState,
    shell: "/bin/bash",
    parserState: createShellIntegrationParserState(),
  };
}

function createIdlePaneState() {
  return {
    ...createDialogState("/bin/bash", "/workspace"),
    shell: "/bin/bash",
    parserState: createShellIntegrationParserState(),
  };
}

async function flush() {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
}

describe("DialogIdleComposer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    resetConfigStore();
    requestAiRecoverySuggestions.mockReset();
    requestAiInlineSuggestions.mockReset();
    requestLocalCompletion.mockReset();
    requestAiInlineSuggestions.mockResolvedValue(null);
    requestLocalCompletion.mockResolvedValue(null);
    requestAiRecoverySuggestions.mockResolvedValue({
      suggestions: [
        {
          id: "recovery:1",
          text: "git status",
          kind: "recovery",
          source: "ai",
          score: 900,
          group: "recovery",
          applyMode: "replace",
          replacement: {
            type: "replace-all",
            value: "git status",
          },
        },
      ],
      latencyMs: 42,
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
    vi.useRealTimers();
  });

  it("shows recovery suggestions for a failed command and fills the input when accepted", async () => {
    const paneState = createFailedPaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input");
    expect(input).not.toBeNull();

    act(() => {
      (input as HTMLInputElement | null)?.focus();
    });

    await flush();
    await flush();

    expect(host.textContent).not.toContain("git status");

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();

    expect(host.textContent).toContain("git status");
    const suggestionButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("git status"),
    );
    expect(suggestionButton).not.toBeNull();

    act(() => {
      suggestionButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      suggestionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flush();

    expect((host.querySelector("input") as HTMLInputElement | null)?.value).toBe("git status");
  });

  it("shows the ghost inline immediately, reveals suggestions on Tab, and accepts the ghost with ArrowRight", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "git status",
          source: "local",
          score: 950,
          kind: "git",
        },
      ],
      context: {
        pwd: "/workspace",
        gitBranch: "main",
        gitStatusSummary: [],
        recentHistory: ["git status"],
        cwdSummary: {
          dirs: ["src"],
          files: ["package.json"],
        },
        systemSummary: {
          os: "ubuntu",
          shell: "/bin/bash",
          packageManager: "apt",
        },
        toolAvailability: ["git"],
      },
    });

    const paneState = createIdlePaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, "git");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    const ghostSuffix = host.querySelector(".dialog-terminal__ghost-suffix");
    expect(ghostSuffix?.textContent).toBe(" status");
    expect((host.querySelector("input") as HTMLInputElement | null)?.getAttribute("placeholder")).toBe("");
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();

    expect(host.textContent).toContain("git status");
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await flush();

    expect((host.querySelector("input") as HTMLInputElement | null)?.value).toBe("git status");
  });

  it("prefers the workflow continuation over repeating the previous git history entry", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "git add .",
          source: "local",
          score: 980,
          kind: "history",
        },
        {
          text: "git status",
          source: "local",
          score: 920,
          kind: "git",
        },
      ],
      context: {
        pwd: "/workspace",
        gitBranch: "main",
        gitStatusSummary: ["M  src/main.tsx"],
        recentHistory: ["git status", "git add ."],
        cwdSummary: {
          dirs: ["src"],
          files: ["package.json"],
        },
        systemSummary: {
          os: "ubuntu",
          shell: "/bin/bash",
          packageManager: "apt",
        },
        toolAvailability: ["git"],
      },
    });

    const paneState = {
      ...createIdlePaneState(),
      composerHistory: ["git status", "git add ."],
      blocks: [
        {
          id: "cmd:status",
          kind: "command" as const,
          cwd: "/workspace",
          command: "git status",
          output: "",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
        {
          id: "cmd:add",
          kind: "command" as const,
          cwd: "/workspace",
          command: "git add .",
          output: "",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
      ],
    };

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, "git ");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    const ghostSuffix = host.querySelector(".dialog-terminal__ghost-suffix");
    expect(ghostSuffix?.textContent).toBe('commit -m ""');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();

    expect(host.textContent).toContain('git commit -m ""');
  });

  it("accepts the highlighted suggestion with ArrowRight after navigating candidates via Ctrl+ArrowDown", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "git status",
          source: "local",
          score: 950,
          kind: "git",
        },
        {
          text: "git stash",
          source: "local",
          score: 940,
          kind: "git",
        },
      ],
      context: {
        pwd: "/workspace",
        gitBranch: "main",
        gitStatusSummary: [],
        recentHistory: ["git status"],
        cwdSummary: {
          dirs: ["src"],
          files: ["package.json"],
        },
        systemSummary: {
          os: "ubuntu",
          shell: "/bin/bash",
          packageManager: "apt",
        },
        toolAvailability: ["git"],
      },
    });

    const paneState = createIdlePaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();

    expect(host.textContent).toContain("git status");
    expect(host.textContent).toContain("git stash");

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: true, bubbles: true }));
    });

    await flush();

    const selectedOptions = host.querySelectorAll('[role="option"][aria-selected="true"]');
    expect(selectedOptions).toHaveLength(1);
    expect(selectedOptions[0]?.textContent).toContain("git stash");

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await flush();

    expect((host.querySelector("input") as HTMLInputElement | null)?.value).toBe("git stash");
  });

  it("shows a ghost for the first suggestion whenever the Tab candidate list is available", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "git status",
          source: "local",
          score: 950,
          kind: "git",
        },
        {
          text: "git stash",
          source: "local",
          score: 940,
          kind: "git",
        },
      ],
      context: {
        pwd: "/workspace",
        gitBranch: "main",
        gitStatusSummary: [],
        recentHistory: ["git status"],
        cwdSummary: {
          dirs: ["src"],
          files: ["package.json"],
        },
        systemSummary: {
          os: "ubuntu",
          shell: "/bin/bash",
          packageManager: "apt",
        },
        toolAvailability: ["git"],
      },
    });

    const paneState = createIdlePaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelector(".dialog-terminal__ghost-suffix")?.textContent).toBe("atus");
  });

  it("refreshes workflow prediction after a commit so push outranks stale pre-commit context", async () => {
    requestLocalCompletion
      .mockResolvedValueOnce({
        suggestions: [
          {
            text: "git add .",
            source: "local",
            score: 980,
            kind: "history",
          },
        ],
        context: {
          pwd: "/workspace",
          gitBranch: "main",
          gitStatusSummary: ["M  src/main.tsx"],
          recentHistory: ["git status", "git add ."],
          cwdSummary: {
            dirs: ["src"],
            files: ["package.json"],
          },
          systemSummary: {
            os: "ubuntu",
            shell: "/bin/bash",
            packageManager: "apt",
          },
          toolAvailability: ["git"],
        },
      })
      .mockResolvedValueOnce(null);

    const beforeCommitPaneState = {
      ...createIdlePaneState(),
      composerHistory: ["git status", "git add ."],
      blocks: [
        {
          id: "cmd:add",
          kind: "command" as const,
          cwd: "/workspace",
          command: "git add .",
          output: "",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
      ],
    };

    act(() => {
      root.render(
        <DialogIdleComposer paneState={beforeCommitPaneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, "git ");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelector(".dialog-terminal__ghost-suffix")?.textContent).toBe('commit -m ""');

    const afterCommitPaneState = {
      ...createIdlePaneState(),
      composerHistory: ["git status", "git add .", 'git commit -m "ship it"'],
      blocks: [
        {
          id: "cmd:add",
          kind: "command" as const,
          cwd: "/workspace",
          command: "git add .",
          output: "",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
        {
          id: "cmd:commit",
          kind: "command" as const,
          cwd: "/workspace",
          command: 'git commit -m "ship it"',
          output: "",
          status: "completed" as const,
          interactive: false,
          exitCode: 0,
        },
      ],
    };

    act(() => {
      root.render(
        <DialogIdleComposer paneState={afterCommitPaneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    await flush();
    await flush();

    expect(host.querySelector(".dialog-terminal__ghost-suffix")?.textContent).toBe("push");
  });
});
