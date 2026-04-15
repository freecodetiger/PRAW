// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDialogState, submitDialogCommand } from "../../../domain/terminal/dialog";
import { getThemePreset } from "../../../domain/theme/presets";
import { createShellIntegrationParserState } from "../lib/shell-integration";
import { BlockWorkspaceSurface } from "./BlockWorkspaceSurface";

vi.mock("./AiWorkflowSurface", () => ({
  AiWorkflowSurface: () => <div data-testid="ai-workflow-surface" />,
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

  it("routes agent workflow panes through the AI workspace inside the unified block surface", () => {
    const paneState = {
      ...createPaneState(),
      presentation: "agent-workflow" as const,
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

    expect(host.querySelector('[data-testid="ai-workflow-surface"]')).not.toBeNull();
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
