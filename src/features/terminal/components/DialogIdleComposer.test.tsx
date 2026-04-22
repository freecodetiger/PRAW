// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { applyShellLifecycleEvent, createDialogState, submitDialogCommand } from "../../../domain/terminal/dialog";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { DialogIdleComposer } from "./DialogIdleComposer";

const tauriWindowApi = vi.hoisted(() => {
  let dragDropHandler: ((event: { payload: unknown }) => void) | null = null;

  return {
    getCurrentWindow: vi.fn(() => ({
      onDragDropEvent: vi.fn(async (handler: typeof dragDropHandler extends infer T ? T : never) => {
        dragDropHandler = handler as typeof dragDropHandler;
        return () => {
          if (dragDropHandler === handler) {
            dragDropHandler = null;
          }
        };
      }),
    })),
    emitDragDropEvent(payload: unknown) {
      dragDropHandler?.({ payload });
    },
    reset() {
      this.getCurrentWindow.mockClear();
      dragDropHandler = null;
    },
  };
});

const {
  requestAiRecoverySuggestions,
  requestAiInlineSuggestions,
  requestAiIntentSuggestions,
  requestLocalCompletion,
  recordCompletionCommandExecution,
  recordCompletionSuggestionAcceptance,
} = vi.hoisted(() => ({
  requestAiRecoverySuggestions: vi.fn(),
  requestAiInlineSuggestions: vi.fn(),
  requestAiIntentSuggestions: vi.fn(),
  requestLocalCompletion: vi.fn(),
  recordCompletionCommandExecution: vi.fn(),
  recordCompletionSuggestionAcceptance: vi.fn(),
}));

vi.mock("../../../lib/tauri/ai", () => ({
  requestAiInlineSuggestions,
  requestAiIntentSuggestions,
  requestAiRecoverySuggestions,
}));

vi.mock("../../../lib/tauri/completion", () => ({
  requestLocalCompletion,
  recordCompletionCommandExecution,
  recordCompletionSuggestionAcceptance,
}));

vi.mock("@tauri-apps/api/window", () => tauriWindowApi);

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
  const paneState = applyShellLifecycleEvent(started, {
    type: "command-end",
    exitCode: 1,
    archivedOutput: "git: 'sttaus' is not a git command\n",
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

function createLocalCompletionContext() {
  return {
    pwd: "/workspace",
    gitBranch: "main",
    gitStatusSummary: [],
    recentHistory: ["git status"],
    cwdSummary: {
      dirs: ["src"],
      files: ["package.json"],
    },
    systemSummary: {
      os: "ubuntu" as const,
      shell: "/bin/bash",
      packageManager: "apt",
    },
    toolAvailability: ["git"],
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
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    resetConfigStore();
    requestAiRecoverySuggestions.mockReset();
    tauriWindowApi.reset();
    requestAiInlineSuggestions.mockReset();
    requestAiIntentSuggestions.mockReset();
    requestLocalCompletion.mockReset();
    recordCompletionCommandExecution.mockReset();
    recordCompletionSuggestionAcceptance.mockReset();
    requestAiInlineSuggestions.mockResolvedValue(null);
    requestAiIntentSuggestions.mockResolvedValue(null);
    requestLocalCompletion.mockResolvedValue(null);
    recordCompletionCommandExecution.mockResolvedValue(undefined);
    recordCompletionSuggestionAcceptance.mockResolvedValue(undefined);
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

    getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      left: 100,
      top: 40,
      right: 420,
      bottom: 140,
      width: 320,
      height: 100,
      x: 100,
      y: 40,
      toJSON() {
        return {};
      },
    } as DOMRect));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    getBoundingClientRectSpy.mockRestore();
    host.remove();
    vi.useRealTimers();
  });

  it("shows the dashed drop target only while files are dragged over the idle composer", async () => {
    const paneState = createIdlePaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    await flush();
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('[aria-label="Dialog file drop target"]')).toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "enter",
        paths: ["/tmp/demo.png"],
        position: { x: 30, y: 20 },
      });
    });

    expect(host.querySelector('[aria-label="Dialog file drop target"]')).toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "enter",
        paths: ["/tmp/demo.png"],
        position: { x: 240, y: 80 },
      });
      await Promise.resolve();
    });

    expect(host.querySelector('[aria-label="Dialog file drop target"]')).not.toBeNull();

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({ type: "leave" });
      await Promise.resolve();
    });

    expect(host.querySelector('[aria-label="Dialog file drop target"]')).toBeNull();
  });

  it("inserts dropped file paths into the idle dialog composer draft", async () => {
    const paneState = createIdlePaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    await flush();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      tauriWindowApi.emitDragDropEvent({
        type: "drop",
        paths: ["/tmp/demo.png", "/tmp/it's here.png"],
        position: { x: 240, y: 80 },
      });
    });

    expect((host.querySelector('textarea') as HTMLTextAreaElement | null)?.value).toBe(
      "'/tmp/demo.png' '/tmp/it'\"'\"'s here.png'",
    );
  });

  it("shows recovery suggestions for a failed command and fills the input when accepted", async () => {
    const paneState = createFailedPaneState();

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea");
    expect(input).not.toBeNull();

    act(() => {
      (input as HTMLTextAreaElement | null)?.focus();
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

    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("git status");
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    const ghostSuffix = host.querySelector(".dialog-terminal__ghost-suffix");
    expect(ghostSuffix?.textContent).toBe(" status");
    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.getAttribute("placeholder")).toBe("");
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

    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("git status");
  });

  it("labels visible suggestions by source", async () => {
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
        gitStatusSummary: [" M src/main.tsx"],
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
    requestAiInlineSuggestions.mockResolvedValue({
      suggestions: [
        {
          id: "ai:inline:1",
          text: "git diff --stat",
          kind: "intent",
          source: "ai",
          score: 900,
          group: "inline",
          applyMode: "replace",
          replacement: {
            type: "replace-all",
            value: "git diff --stat",
          },
        },
      ],
      latencyMs: 2400,
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git ");
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

    expect(host.textContent).toContain("Local");
    expect(host.textContent).toContain("System");
    expect(host.textContent).toContain("AI");
  });

  it("shows AI loading while local suggestions remain available", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [{ text: "git status", source: "local", score: 950, kind: "git" }],
      context: createLocalCompletionContext(),
    });
    requestAiInlineSuggestions.mockReturnValue(new Promise(() => undefined));

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git");
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
    expect(host.textContent).toContain("AI loading...");
  });

  it("shows AI timeout without clearing local suggestions", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [{ text: "git status", source: "local", score: 950, kind: "git" }],
      context: createLocalCompletionContext(),
    });
    requestAiInlineSuggestions.mockResolvedValue({
      status: "timeout",
      suggestions: [],
      message: "request timed out",
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git");
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
    expect(host.textContent).toContain("AI timed out");
  });

  it("shows AI empty results without clearing local suggestions", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [{ text: "git status", source: "local", score: 950, kind: "git" }],
      context: createLocalCompletionContext(),
    });
    requestAiInlineSuggestions.mockResolvedValue({
      status: "empty",
      suggestions: [],
      latencyMs: 1800,
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git");
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
    expect(host.textContent).toContain("AI returned 0 suggestions");
  });

  it("shows mysql command continuation suggestions for mysql prefixes", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "mysql -u root -p",
          source: "local",
          score: 950,
          kind: "database",
        },
        {
          text: "mysqldump mydb > mydb.sql",
          source: "local",
          score: 920,
          kind: "database",
        },
      ],
      context: createLocalCompletionContext(),
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "my");
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

    const options = Array.from(host.querySelectorAll('[role="option"]'));
    expect(options[0]?.textContent).toContain("mysql -u root -p");
    expect(options[1]?.textContent).toContain("mysqldump mydb > mydb.sql");
  });

  it("uses Tab to request AI intent suggestions for natural language without filling or executing immediately", async () => {
    const onSubmitCommand = vi.fn();
    requestLocalCompletion.mockResolvedValue({
      suggestions: [],
      context: createLocalCompletionContext(),
    });
    requestAiIntentSuggestions.mockResolvedValue({
      status: "success",
      suggestions: [
        {
          id: "ai:intent:1",
          text: "lsof -i :3000",
          kind: "intent",
          source: "ai",
          score: 900,
          group: "intent",
          applyMode: "replace",
          replacement: {
            type: "replace-all",
            value: "lsof -i :3000",
          },
          reason: "find process using port",
        },
      ],
      latencyMs: 1200,
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={onSubmitCommand} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "查看 3000 端口被谁占用");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();
    await flush();

    expect(requestAiIntentSuggestions).toHaveBeenCalled();
    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("查看 3000 端口被谁占用");
    expect(onSubmitCommand).not.toHaveBeenCalled();
    expect(host.textContent).toContain("AI");
    expect(host.textContent).toContain("intent");
    expect(host.textContent).toContain("lsof -i :3000");
    expect(host.textContent).toContain("find process using port");

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await flush();

    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("lsof -i :3000");
    expect(onSubmitCommand).not.toHaveBeenCalled();
  });

  it("requests mysql-oriented ai intent suggestions for mysql natural language", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [],
      context: createLocalCompletionContext(),
    });
    requestAiIntentSuggestions.mockResolvedValue({
      status: "success",
      suggestions: [
        {
          id: "ai:intent:mysql:1",
          text: "mysql -u root -p -e \"SHOW DATABASES;\"",
          kind: "intent",
          source: "ai",
          score: 900,
          group: "intent",
          applyMode: "replace",
          replacement: {
            type: "replace-all",
            value: "mysql -u root -p -e \"SHOW DATABASES;\"",
          },
          reason: "list databases",
        },
      ],
      latencyMs: 1200,
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "查看 mysql 所有数据库");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();
    await flush();

    expect(requestAiIntentSuggestions).toHaveBeenCalled();
    expect(host.textContent).toContain("mysql -u root -p -e \"SHOW DATABASES;\"");
    expect(host.textContent).toContain("list databases");
  });

  it("re-ranks later inline suggestions using current-session accepted feedback", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        {
          text: "pnpm run dev",
          source: "local",
          score: 930,
          kind: "package",
        },
        {
          text: "pnpm test",
          source: "local",
          score: 500,
          kind: "package",
        },
      ],
      context: createLocalCompletionContext(),
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "pn");
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

    let options = Array.from(host.querySelectorAll('[role="option"]'));
    expect(options[0]?.textContent).toContain("pnpm run dev");
    expect(options[1]?.textContent).toContain("pnpm test");

    const preferredOption = options.find((option) => option.textContent?.includes("pnpm test"));
    expect(preferredOption).not.toBeUndefined();

    act(() => {
      preferredOption?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      preferredOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flush();

    act(() => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();

    act(() => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "pn");
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

    options = Array.from(host.querySelectorAll('[role="option"]'));
    expect(options[0]?.textContent).toContain("pnpm test");
  });

  it("passes rejected AI intent suggestions back as session hints after dismissal", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [],
      context: createLocalCompletionContext(),
    });
    requestAiIntentSuggestions.mockResolvedValue({
      status: "success",
      suggestions: [
        {
          id: "ai:intent:1",
          text: "lsof -i :3000",
          kind: "intent",
          source: "ai",
          score: 900,
          group: "intent",
          applyMode: "replace",
          replacement: {
            type: "replace-all",
            value: "lsof -i :3000",
          },
          reason: "find process using port",
        },
      ],
      latencyMs: 1200,
    });

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "查看 3000 端口被谁占用");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.textContent).toContain("lsof -i :3000");

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await flush();

    act(() => {
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "查看 4000 端口被谁占用");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();
    await flush();

    expect(requestAiIntentSuggestions).toHaveBeenCalledTimes(2);
    expect(requestAiIntentSuggestions.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        contextPack: expect.objectContaining({
          userPreferenceHints: expect.arrayContaining(["rejected:lsof -i :3000"]),
        }),
      }),
    );
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
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

    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("git stash");
  });

  it("navigates the explicit suggestion bar with plain ArrowDown", async () => {
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
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

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    await flush();

    const selectedOptions = host.querySelectorAll('[role="option"][aria-selected="true"]');
    expect(selectedOptions).toHaveLength(1);
    expect(selectedOptions[0]?.textContent).toContain("git stash");
  });

  it("keeps plain ArrowUp bound to history when the suggestion bar is closed", async () => {
    const paneState = {
      ...createIdlePaneState(),
      composerHistory: ["pwd", "git status"],
    };

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });

    await flush();

    expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("git status");
  });

  it("navigates auto-opened suggestions with plain ArrowDown", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        { text: "git status", source: "local", score: 950, kind: "git" },
        { text: "git stash", source: "local", score: 940, kind: "git" },
        { text: "git stage", source: "local", score: 930, kind: "git" },
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

    const paneState = {
      ...createIdlePaneState(),
      composerHistory: ["pwd", "git status"],
    };

    act(() => {
      root.render(
        <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelectorAll('[role="option"]')).toHaveLength(3);

    const beforeSelected = host.querySelector('[role="option"][aria-selected="true"]');
    expect(beforeSelected).not.toBeNull();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    await flush();

    const afterSelected = host.querySelector('[role="option"][aria-selected="true"]');
    expect(afterSelected).not.toBeNull();
    expect(afterSelected?.textContent).not.toBe(beforeSelected?.textContent);
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelector(".dialog-terminal__ghost-suffix")?.textContent).toBe("atus");
  });

  it("auto-opens the suggestion bubble when smart bubble is enabled and there are at least three suggestions", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        { text: "git status", source: "local", score: 950, kind: "git" },
        { text: "git stash", source: "local", score: 940, kind: "git" },
        { text: "git stage", source: "local", score: 930, kind: "git" },
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

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it("keeps the bubble hidden below three suggestions until Tab is pressed even when smart bubble is enabled", async () => {
    requestLocalCompletion.mockResolvedValue({
      suggestions: [
        { text: "git status", source: "local", score: 950, kind: "git" },
        { text: "git stash", source: "local", score: 940, kind: "git" },
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

    act(() => {
      root.render(
        <DialogIdleComposer paneState={createIdlePaneState()} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
      );
    });

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        descriptor?.set?.call(input, "git st");
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await flush();

    expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
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

    const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      if (input) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
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
