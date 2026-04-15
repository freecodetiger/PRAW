// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState, submitDialogCommand } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { BlockWorkspaceSurface } from "./BlockWorkspaceSurface";

const renderCalls: Array<{ inputSuspended?: boolean }> = [];

vi.mock("./ClassicTerminalSurface", () => ({
  ClassicTerminalSurface: (props: { inputSuspended?: boolean }) => {
    renderCalls.push({
      inputSuspended: props.inputSuspended,
    });
    return <div data-testid="classic-terminal-surface" />;
  },
}));

vi.mock("./LiveCommandConsole", () => ({
  LiveCommandConsole: () => <div data-testid="live-command-console" />,
}));

function createPaneState() {
  return {
    ...createDialogState("/bin/bash", "/workspace"),
    shell: "/bin/bash",
    parserState: createShellIntegrationParserState(),
  };
}

describe("BlockWorkspaceSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    renderCalls.length = 0;
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

  it("renders the AI workflow path as one raw terminal surface without structured transcript chrome", () => {
    const paneState = {
      ...createPaneState(),
      presentation: "agent-workflow" as const,
      mode: "classic" as const,
      modeSource: "auto-interactive" as const,
      agentBridge: {
        provider: "codex" as const,
        mode: "structured" as const,
        state: "ready" as const,
        fallbackReason: null,
      },
      aiTranscript: {
        entries: [
          {
            id: "prompt:1",
            kind: "prompt" as const,
            text: "Summarize the latest diff",
          },
        ],
      },
    };

    act(() => {
      root.render(
        <BlockWorkspaceSurface
          tabId="tab:1"
          paneState={paneState}
          status="running"
          sessionId="session-1"
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitCommand={() => undefined}
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(renderCalls[renderCalls.length - 1]?.inputSuspended).toBe(false);
    expect(host.querySelector(".ai-workflow__transcript")).toBeNull();
    expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
    expect(host.textContent).not.toContain("Open Expert Drawer");
  });

  it("forwards AI-path prompt-control props into the raw-only workflow surface", () => {
    const paneState = {
      ...createPaneState(),
      presentation: "agent-workflow" as const,
      mode: "classic" as const,
      modeSource: "auto-interactive" as const,
      agentBridge: {
        provider: "codex" as const,
        mode: "structured" as const,
        state: "ready" as const,
        fallbackReason: null,
      },
      aiTranscript: {
        entries: [],
      },
    };

    act(() => {
      root.render(
        <BlockWorkspaceSurface
          tabId="tab:1"
          paneState={paneState}
          status="running"
          sessionId="session-1"
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitCommand={() => undefined}
          onSubmitAiInput={async () => undefined}
          quickPromptOpenRequestKey={1}
        />,
      );
    });

    expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
  });

  it("does not render legacy resume picker chrome for AI workflow panes", () => {
    const paneState = {
      ...createPaneState(),
      presentation: "agent-workflow" as const,
      mode: "classic" as const,
      modeSource: "auto-interactive" as const,
      agentBridge: {
        provider: "codex" as const,
        mode: "structured" as const,
        state: "ready" as const,
        fallbackReason: null,
      },
      aiTranscript: {
        entries: [],
      },
    };

    act(() => {
      root.render(
        <BlockWorkspaceSurface
          tabId="tab:1"
          paneState={paneState}
          status="running"
          sessionId="session-1"
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitCommand={() => undefined}
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Resume Codex session");
    expect(host.querySelector(".ai-workflow__resume-picker")).toBeNull();
  });

  it("keeps interactive command tabs inside the same block workspace via a live island instead of a separate classic surface", () => {
    const paneState = {
      ...submitDialogCommand(createPaneState(), "vim README.md", () => "cmd:1"),
      mode: "classic" as const,
      modeSource: "auto-interactive" as const,
      shell: "/bin/bash",
      parserState: createShellIntegrationParserState(),
    };

    act(() => {
      root.render(
        <BlockWorkspaceSurface
          tabId="tab:1"
          paneState={paneState}
          status="running"
          sessionId="session-1"
          paneHeight={720}
          fontFamily="monospace"
          fontSize={14}
          theme={getThemePreset("dark").terminal}
          isActive={true}
          write={async () => undefined}
          resize={async () => undefined}
          onSubmitCommand={() => undefined}
          onSubmitAiInput={async () => undefined}
        />,
      );
    });

    expect(host.querySelector(".dialog-terminal")).not.toBeNull();
    expect(host.querySelector('[data-testid="live-command-console"]')).not.toBeNull();
  });
});
