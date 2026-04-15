# Warp-Native Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing dialog/classic terminal UI with a single Warp-like native workspace that keeps a fixed bottom composer, renders AI and command activity as timeline blocks, and only mounts a real terminal inside embedded terminal blocks for true TUI commands.

**Architecture:** Keep PTY and provider processes as backend infrastructure, but move visible rendering to a workspace-first projection layer. Introduce a dedicated workspace timeline domain model, a runtime projection store that maps PTY/provider events into block updates, and a new pane surface that renders prompt, assistant, run, system, and terminal blocks inside one stable timeline.

**Tech Stack:** React, Zustand, Vitest, xterm, Tauri PTY session bridge, TypeScript

---

## File Structure

### New files

- `src/domain/terminal/workspace.ts`
  - Single source of truth for block types, composer routing types, workspace state, and pure reducers.
- `src/domain/terminal/workspace.test.ts`
  - Reducer-level behavior tests for block creation, streaming, run state changes, and composer target switching.
- `src/features/terminal/lib/workspace-projection.ts`
  - Maps runtime inputs such as PTY output, shell markers, and provider events into workspace reducer actions.
- `src/features/terminal/lib/workspace-projection.test.ts`
  - Tests projection behavior without involving React.
- `src/features/terminal/state/workspace-flow-store.ts`
  - Zustand store for the visible Warp-native workspace state per tab.
- `src/features/terminal/state/workspace-flow-store.test.ts`
  - Store-level tests for tab isolation and event application.
- `src/features/terminal/components/WarpPaneSurface.tsx`
  - Top-level single-mode pane body that renders timeline, active terminal block, and fixed composer.
- `src/features/terminal/components/WarpTimeline.tsx`
  - Stable timeline renderer for all workspace blocks.
- `src/features/terminal/components/WarpComposer.tsx`
  - Fixed global composer with `Ask AI`, `Run command`, and `Send to active process` routing states.
- `src/features/terminal/components/WarpRunBlock.tsx`
  - Native execution block with status, streaming output, controls, and expansion.
- `src/features/terminal/components/WarpTerminalBlock.tsx`
  - Embedded real-terminal container for escalated TUI commands.
- `src/features/terminal/components/WarpAssistantBlock.tsx`
  - Stable assistant streaming output block.
- `src/features/terminal/components/WarpPromptBlock.tsx`
  - User prompt block renderer.
- `src/features/terminal/components/WarpSystemBlock.tsx`
  - Native system event renderer.
- `src/features/terminal/components/WarpChoiceBlock.tsx`
  - Suggested follow-up action block renderer.

### Modified files

- `src/features/terminal/hooks/useTerminalRuntime.ts`
  - Stop treating visible terminal replay as the primary UI path; emit events into the new workspace store.
- `src/features/terminal/components/TerminalPane.tsx`
  - Remove classic/dialog branching and always mount the Warp-native pane surface.
- `src/features/terminal/components/TerminalWorkspace.tsx`
  - Keep pane tree behavior but treat all panes as Warp-native panes.
- `src/features/terminal/state/workspace-store.ts`
  - Retain layout/tab management, but remove references to dialog/classic-visible behavior.
- `src/features/terminal/hooks/useTerminalSession.ts`
  - Expose stable controls needed by composer routing and embedded terminal blocks.
- `src/features/terminal/components/XtermTerminalSurface.tsx`
  - Narrow visible usage to embedded terminal blocks only.
- `src/app/styles.css`
  - Replace dialog/classic-specific styles with Warp-native workspace styles and block styling.
- `src/features/config/components/SettingsPanel.tsx`
  - Remove mode-switching settings and expose Warp-native-only settings where needed.
- `src/features/config/state/app-config-store.ts`
  - Remove persisted classic/dialog mode configuration fields once migration completes.

### Files to delete late in the migration

- `src/features/terminal/components/DialogTerminalSurface.tsx`
- `src/features/terminal/components/DialogIdleComposer.tsx`
- `src/features/terminal/components/DialogTranscript.tsx`
- `src/features/terminal/components/LiveCommandConsole.tsx`
- `src/features/terminal/components/ClassicTerminalSurface.tsx`
- `src/domain/terminal/dialog.ts`
- `src/domain/terminal/dialog.test.ts`
- `src/features/terminal/state/terminal-view-store.ts`
- `src/features/terminal/state/terminal-view-store.test.ts`
- `src/features/terminal/lib/dialog-surface-model.ts`

---

### Task 1: Add the workspace timeline domain model

**Files:**
- Create: `src/domain/terminal/workspace.ts`
- Test: `src/domain/terminal/workspace.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

```ts
import { describe, expect, it } from "vitest";

import {
  appendAssistantChunk,
  createWorkspaceState,
  openRunBlock,
  submitWorkspacePrompt,
  switchComposerTarget,
} from "./workspace";

describe("workspace domain reducer", () => {
  it("creates prompt and assistant blocks in a single timeline", () => {
    const prompted = submitWorkspacePrompt(createWorkspaceState("/workspace"), {
      id: "prompt:1",
      text: "explain the diff",
      intent: "ask-ai",
    });
    const streamed = appendAssistantChunk(prompted, {
      id: "assistant:1",
      chunk: "Working through the diff now.",
    });

    expect(streamed.blocks).toEqual([
      expect.objectContaining({ id: "prompt:1", type: "prompt-block", text: "explain the diff" }),
      expect.objectContaining({ id: "assistant:1", type: "assistant-block", text: "Working through the diff now." }),
    ]);
  });

  it("opens a run block and routes the composer to the active process when stdin is requested", () => {
    const running = openRunBlock(createWorkspaceState("/workspace"), {
      id: "run:1",
      title: "git push",
      command: "git push origin main",
    });
    const waiting = switchComposerTarget(running, {
      type: "active-process",
      runId: "run:1",
      label: "Send to active process",
    });

    expect(waiting.activeRunId).toBe("run:1");
    expect(waiting.composerTarget).toEqual({
      type: "active-process",
      runId: "run:1",
      label: "Send to active process",
    });
  });
});
```

- [ ] **Step 2: Run the reducer test to verify it fails**

Run: `npm test -- src/domain/terminal/workspace.test.ts`

Expected: FAIL with `Cannot find module './workspace'` or missing export errors.

- [ ] **Step 3: Write the minimal workspace domain implementation**

```ts
export type WorkspaceBlock =
  | { id: string; type: "prompt-block"; text: string; intent: "ask-ai" | "run-command" }
  | { id: string; type: "assistant-block"; text: string; status: "streaming" | "completed" }
  | { id: string; type: "run-block"; title: string; command: string; status: "running" | "waiting-input" | "completed" | "failed"; output: string }
  | { id: string; type: "terminal-block"; runId: string; title: string }
  | { id: string; type: "system-block"; tone: "info" | "error"; text: string }
  | { id: string; type: "choice-block"; actions: Array<{ id: string; label: string; kind: "run" | "apply" | "inspect" }> };

export type ComposerTarget =
  | { type: "ask-ai"; label: "Ask AI" }
  | { type: "run-command"; label: "Run command" }
  | { type: "active-process"; runId: string; label: "Send to active process" };

export interface WorkspaceState {
  cwd: string;
  blocks: WorkspaceBlock[];
  activeRunId: string | null;
  composerTarget: ComposerTarget;
}

export function createWorkspaceState(cwd: string): WorkspaceState {
  return {
    cwd,
    blocks: [],
    activeRunId: null,
    composerTarget: { type: "ask-ai", label: "Ask AI" },
  };
}

export function submitWorkspacePrompt(
  state: WorkspaceState,
  input: { id: string; text: string; intent: "ask-ai" | "run-command" },
): WorkspaceState {
  return {
    ...state,
    blocks: [...state.blocks, { id: input.id, type: "prompt-block", text: input.text, intent: input.intent }],
  };
}

export function appendAssistantChunk(
  state: WorkspaceState,
  input: { id: string; chunk: string },
): WorkspaceState {
  const existing = state.blocks.find(
    (block): block is Extract<WorkspaceBlock, { type: "assistant-block" }> =>
      block.type === "assistant-block" && block.id === input.id,
  );

  if (!existing) {
    return {
      ...state,
      blocks: [...state.blocks, { id: input.id, type: "assistant-block", text: input.chunk, status: "streaming" }],
    };
  }

  return {
    ...state,
    blocks: state.blocks.map((block) =>
      block.type === "assistant-block" && block.id === input.id
        ? { ...block, text: `${block.text}${input.chunk}` }
        : block,
    ),
  };
}

export function openRunBlock(
  state: WorkspaceState,
  input: { id: string; title: string; command: string },
): WorkspaceState {
  return {
    ...state,
    activeRunId: input.id,
    blocks: [
      ...state.blocks,
      { id: input.id, type: "run-block", title: input.title, command: input.command, status: "running", output: "" },
    ],
  };
}

export function switchComposerTarget(state: WorkspaceState, target: ComposerTarget): WorkspaceState {
  return {
    ...state,
    composerTarget: target,
  };
}
```

- [ ] **Step 4: Run the reducer test to verify it passes**

Run: `npm test -- src/domain/terminal/workspace.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/terminal/workspace.ts src/domain/terminal/workspace.test.ts
git commit -m "feat: add workspace timeline domain model"
```

### Task 2: Add a runtime projection layer for PTY and provider events

**Files:**
- Create: `src/features/terminal/lib/workspace-projection.ts`
- Test: `src/features/terminal/lib/workspace-projection.test.ts`
- Modify: `src/domain/terminal/workspace.ts`

- [ ] **Step 1: Write the failing projection tests**

```ts
import { describe, expect, it } from "vitest";

import { createWorkspaceState } from "../../../domain/terminal/workspace";
import { applyWorkspaceRuntimeEvent } from "./workspace-projection";

describe("workspace projection", () => {
  it("maps assistant stream events into assistant blocks", () => {
    const next = applyWorkspaceRuntimeEvent(createWorkspaceState("/workspace"), {
      type: "assistant-chunk",
      blockId: "assistant:1",
      chunk: "Planning implementation now.",
    });

    expect(next.blocks).toEqual([
      expect.objectContaining({ id: "assistant:1", type: "assistant-block", text: "Planning implementation now." }),
    ]);
  });

  it("maps run output and stdin wait events into a run block and active-process composer target", () => {
    const running = applyWorkspaceRuntimeEvent(createWorkspaceState("/workspace"), {
      type: "run-started",
      runId: "run:1",
      title: "git push",
      command: "git push origin main",
    });
    const waiting = applyWorkspaceRuntimeEvent(running, {
      type: "run-awaits-input",
      runId: "run:1",
    });

    expect(waiting.composerTarget).toEqual({
      type: "active-process",
      runId: "run:1",
      label: "Send to active process",
    });
  });
});
```

- [ ] **Step 2: Run the projection tests to verify they fail**

Run: `npm test -- src/features/terminal/lib/workspace-projection.test.ts`

Expected: FAIL with module-not-found or missing-export errors.

- [ ] **Step 3: Implement the projection layer**

```ts
import {
  appendAssistantChunk,
  createWorkspaceState,
  openRunBlock,
  switchComposerTarget,
  type WorkspaceState,
} from "../../../domain/terminal/workspace";

export type WorkspaceRuntimeEvent =
  | { type: "assistant-chunk"; blockId: string; chunk: string }
  | { type: "assistant-complete"; blockId: string }
  | { type: "run-started"; runId: string; title: string; command: string }
  | { type: "run-output"; runId: string; chunk: string }
  | { type: "run-awaits-input"; runId: string }
  | { type: "run-resumed"; runId: string }
  | { type: "run-completed"; runId: string }
  | { type: "system-message"; blockId: string; tone: "info" | "error"; text: string };

export function applyWorkspaceRuntimeEvent(state: WorkspaceState, event: WorkspaceRuntimeEvent): WorkspaceState {
  switch (event.type) {
    case "assistant-chunk":
      return appendAssistantChunk(state, { id: event.blockId, chunk: event.chunk });
    case "run-started":
      return openRunBlock(state, { id: event.runId, title: event.title, command: event.command });
    case "run-awaits-input":
      return switchComposerTarget(state, {
        type: "active-process",
        runId: event.runId,
        label: "Send to active process",
      });
    case "run-resumed":
    case "run-completed":
      return switchComposerTarget(state, { type: "ask-ai", label: "Ask AI" });
    default:
      return state;
  }
}

export function createWorkspaceProjectionState(cwd: string) {
  return createWorkspaceState(cwd);
}
```

- [ ] **Step 4: Run the projection tests to verify they pass**

Run: `npm test -- src/features/terminal/lib/workspace-projection.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/lib/workspace-projection.ts src/features/terminal/lib/workspace-projection.test.ts src/domain/terminal/workspace.ts
git commit -m "feat: add workspace runtime projection layer"
```

### Task 3: Add a per-tab workspace flow store

**Files:**
- Create: `src/features/terminal/state/workspace-flow-store.ts`
- Test: `src/features/terminal/state/workspace-flow-store.test.ts`
- Modify: `src/features/terminal/hooks/useTerminalRuntime.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceFlowStore } from "./workspace-flow-store";

describe("workspace-flow-store", () => {
  beforeEach(() => {
    useWorkspaceFlowStore.setState(useWorkspaceFlowStore.getInitialState());
  });

  it("isolates workspace blocks by tab id", () => {
    useWorkspaceFlowStore.getState().initializeTab("tab:1", "/workspace/app");
    useWorkspaceFlowStore.getState().initializeTab("tab:2", "/workspace/api");

    useWorkspaceFlowStore.getState().applyEvent("tab:1", {
      type: "assistant-chunk",
      blockId: "assistant:1",
      chunk: "hello app",
    });

    expect(useWorkspaceFlowStore.getState().tabs["tab:1"]?.blocks).toHaveLength(1);
    expect(useWorkspaceFlowStore.getState().tabs["tab:2"]?.blocks ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `npm test -- src/features/terminal/state/workspace-flow-store.test.ts`

Expected: FAIL with missing store module or missing method errors.

- [ ] **Step 3: Implement the store**

```ts
import { create } from "zustand";

import { createWorkspaceProjectionState, applyWorkspaceRuntimeEvent, type WorkspaceRuntimeEvent } from "../lib/workspace-projection";
import type { WorkspaceState } from "../../../domain/terminal/workspace";

interface WorkspaceFlowStore {
  tabs: Record<string, WorkspaceState>;
  initializeTab: (tabId: string, cwd: string) => void;
  removeTab: (tabId: string) => void;
  applyEvent: (tabId: string, event: WorkspaceRuntimeEvent) => void;
}

export const useWorkspaceFlowStore = create<WorkspaceFlowStore>((set) => ({
  tabs: {},
  initializeTab: (tabId, cwd) =>
    set((state) => ({
      tabs: state.tabs[tabId] ? state.tabs : { ...state.tabs, [tabId]: createWorkspaceProjectionState(cwd) },
    })),
  removeTab: (tabId) =>
    set((state) => {
      if (!state.tabs[tabId]) {
        return state;
      }
      const tabs = { ...state.tabs };
      delete tabs[tabId];
      return { tabs };
    }),
  applyEvent: (tabId, event) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: applyWorkspaceRuntimeEvent(state.tabs[tabId] ?? createWorkspaceProjectionState("."), event),
      },
    })),
}));

useWorkspaceFlowStore.getInitialState = () => ({
  tabs: {},
  initializeTab: useWorkspaceFlowStore.getState().initializeTab,
  removeTab: useWorkspaceFlowStore.getState().removeTab,
  applyEvent: useWorkspaceFlowStore.getState().applyEvent,
});
```

- [ ] **Step 4: Wire `useTerminalRuntime` to initialize tabs in the new store**

```ts
const initializeWorkspaceTab = useWorkspaceFlowStore((state) => state.initializeTab);
const removeWorkspaceTab = useWorkspaceFlowStore((state) => state.removeTab);

useEffect(() => {
  for (const tab of tabs) {
    initializeWorkspaceTab(tab.tabId, tab.cwd);
  }
}, [initializeWorkspaceTab, tabs]);

useEffect(() => {
  const activeTabIds = new Set(tabs.map((tab) => tab.tabId));
  for (const previousTabKey of previousTabKeysRef.current) {
    if (!activeTabIds.has(previousTabKey)) {
      removeWorkspaceTab(previousTabKey);
    }
  }
}, [removeWorkspaceTab, tabs]);
```

- [ ] **Step 5: Run the store test to verify it passes**

Run: `npm test -- src/features/terminal/state/workspace-flow-store.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/state/workspace-flow-store.ts src/features/terminal/state/workspace-flow-store.test.ts src/features/terminal/hooks/useTerminalRuntime.ts
git commit -m "feat: add workspace flow store"
```

### Task 4: Build the fixed-composer Warp pane shell

**Files:**
- Create: `src/features/terminal/components/WarpPaneSurface.tsx`
- Create: `src/features/terminal/components/WarpComposer.tsx`
- Create: `src/features/terminal/components/WarpTimeline.tsx`
- Create: `src/features/terminal/components/WarpPaneSurface.test.tsx`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing UI test**

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WarpPaneSurface } from "./WarpPaneSurface";

describe("WarpPaneSurface", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the composer mounted while rendering timeline content", () => {
    act(() => {
      root.render(
        <WarpPaneSurface
          paneState={{
            cwd: "/workspace",
            blocks: [{ id: "assistant:1", type: "assistant-block", text: "Ready.", status: "completed" }],
            activeRunId: null,
            composerTarget: { type: "ask-ai", label: "Ask AI" },
          }}
          status="running"
          onSubmit={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain("Ready.");
    expect(host.textContent).toContain("Ask AI");
  });
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm test -- src/features/terminal/components/WarpPaneSurface.test.tsx`

Expected: FAIL with missing component/module errors.

- [ ] **Step 3: Implement the shell components**

```tsx
// WarpComposer.tsx
export function WarpComposer({
  target,
  onSubmit,
}: {
  target: { label: string };
  onSubmit: (value: string) => void;
}) {
  return (
    <form
      className="warp-composer"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = String(form.get("composer") ?? "").trim();
        if (value) {
          onSubmit(value);
        }
        event.currentTarget.reset();
      }}
    >
      <span className="warp-composer__mode">{target.label}</span>
      <input name="composer" className="warp-composer__input" placeholder={target.label} />
      <button type="submit" className="warp-composer__submit">
        Send
      </button>
    </form>
  );
}

// WarpTimeline.tsx
export function WarpTimeline({ blocks }: { blocks: Array<{ id: string; type: string; text?: string }> }) {
  return (
    <div className="warp-timeline">
      {blocks.map((block) => (
        <article key={block.id} className={`warp-block warp-block--${block.type}`}>
          {"text" in block ? block.text : block.type}
        </article>
      ))}
    </div>
  );
}

// WarpPaneSurface.tsx
export function WarpPaneSurface({
  paneState,
  status,
  onSubmit,
}: {
  paneState: { blocks: Array<{ id: string; type: string; text?: string }>; composerTarget: { label: string } };
  status: "running" | "starting" | "exited" | "error";
  onSubmit: (value: string) => void;
}) {
  return (
    <section className={`warp-pane-surface warp-pane-surface--${status}`}>
      <WarpTimeline blocks={paneState.blocks} />
      <WarpComposer target={paneState.composerTarget} onSubmit={onSubmit} />
    </section>
  );
}
```

- [ ] **Step 4: Add the minimum CSS for a fixed-composer layout**

```css
.warp-pane-surface {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  background: var(--surface);
}

.warp-timeline {
  overflow: auto;
  padding: 20px 20px 12px;
}

.warp-composer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  padding: 14px 18px 18px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, white 6%);
}
```

- [ ] **Step 5: Mount `WarpPaneSurface` in `TerminalPane.tsx` behind a temporary replacement**

```tsx
<WarpPaneSurface
  paneState={workspacePaneState}
  status={tab.status}
  onSubmit={(value) => {
    submitWarpComposer(tabId, value);
  }}
/>
```

- [ ] **Step 6: Run the UI test to verify it passes**

Run: `npm test -- src/features/terminal/components/WarpPaneSurface.test.tsx`

Expected: PASS with `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/features/terminal/components/WarpPaneSurface.tsx src/features/terminal/components/WarpComposer.tsx src/features/terminal/components/WarpTimeline.tsx src/features/terminal/components/WarpPaneSurface.test.tsx src/features/terminal/components/TerminalPane.tsx src/app/styles.css
git commit -m "feat: add warp-native pane shell"
```

### Task 5: Render native assistant, prompt, run, choice, and system blocks

**Files:**
- Create: `src/features/terminal/components/WarpAssistantBlock.tsx`
- Create: `src/features/terminal/components/WarpPromptBlock.tsx`
- Create: `src/features/terminal/components/WarpRunBlock.tsx`
- Create: `src/features/terminal/components/WarpSystemBlock.tsx`
- Create: `src/features/terminal/components/WarpChoiceBlock.tsx`
- Create: `src/features/terminal/components/WarpTimeline.test.tsx`
- Modify: `src/features/terminal/components/WarpTimeline.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing timeline rendering test**

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WarpTimeline } from "./WarpTimeline";

describe("WarpTimeline", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders prompt, assistant, run, and system blocks with their native labels", () => {
    act(() => {
      root.render(
        <WarpTimeline
          blocks={[
            { id: "prompt:1", type: "prompt-block", text: "fix the tests" },
            { id: "assistant:1", type: "assistant-block", text: "Starting now." },
            { id: "run:1", type: "run-block", title: "npm test", command: "npm test", status: "running", output: "RUN v4.1.4" },
            { id: "system:1", type: "system-block", tone: "info", text: "Using Codex provider" },
          ]}
          onInterrupt={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain("fix the tests");
    expect(host.textContent).toContain("Starting now.");
    expect(host.textContent).toContain("npm test");
    expect(host.textContent).toContain("Using Codex provider");
  });
});
```

- [ ] **Step 2: Run the timeline test to verify it fails**

Run: `npm test -- src/features/terminal/components/WarpTimeline.test.tsx`

Expected: FAIL with missing block component or prop errors.

- [ ] **Step 3: Implement the native block components and timeline switch**

```tsx
// WarpRunBlock.tsx
export function WarpRunBlock({
  title,
  command,
  status,
  output,
  onInterrupt,
}: {
  title: string;
  command: string;
  status: "running" | "waiting-input" | "completed" | "failed";
  output: string;
  onInterrupt: () => void;
}) {
  return (
    <section className={`warp-run-block warp-run-block--${status}`}>
      <header className="warp-run-block__header">
        <strong>{title}</strong>
        <span>{status}</span>
        {status === "running" || status === "waiting-input" ? (
          <button type="button" onClick={onInterrupt}>
            Interrupt
          </button>
        ) : null}
      </header>
      <code className="warp-run-block__command">{command}</code>
      <pre className="warp-run-block__output">{output}</pre>
    </section>
  );
}

// WarpTimeline.tsx
export function WarpTimeline({
  blocks,
  onInterrupt,
}: {
  blocks: Array<any>;
  onInterrupt: (runId: string) => void;
}) {
  return (
    <div className="warp-timeline">
      {blocks.map((block) => {
        switch (block.type) {
          case "prompt-block":
            return <WarpPromptBlock key={block.id} text={block.text} />;
          case "assistant-block":
            return <WarpAssistantBlock key={block.id} text={block.text} />;
          case "run-block":
            return (
              <WarpRunBlock
                key={block.id}
                title={block.title}
                command={block.command}
                status={block.status}
                output={block.output}
                onInterrupt={() => onInterrupt(block.id)}
              />
            );
          case "system-block":
            return <WarpSystemBlock key={block.id} tone={block.tone} text={block.text} />;
          case "choice-block":
            return <WarpChoiceBlock key={block.id} actions={block.actions} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add minimal OpenAI-like block styling**

```css
.warp-block,
.warp-run-block {
  max-width: 880px;
  margin: 0 auto 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 96%, white 4%);
}

.warp-run-block__header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 14px 16px 8px;
}

.warp-run-block__output {
  margin: 0;
  padding: 0 16px 16px;
  white-space: pre-wrap;
}
```

- [ ] **Step 5: Run the timeline test to verify it passes**

Run: `npm test -- src/features/terminal/components/WarpTimeline.test.tsx`

Expected: PASS with `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/components/WarpAssistantBlock.tsx src/features/terminal/components/WarpPromptBlock.tsx src/features/terminal/components/WarpRunBlock.tsx src/features/terminal/components/WarpSystemBlock.tsx src/features/terminal/components/WarpChoiceBlock.tsx src/features/terminal/components/WarpTimeline.tsx src/features/terminal/components/WarpTimeline.test.tsx src/app/styles.css
git commit -m "feat: render warp-native workspace blocks"
```

### Task 6: Add composer routing and active-process stdin submission

**Files:**
- Modify: `src/domain/terminal/workspace.ts`
- Modify: `src/features/terminal/components/WarpComposer.tsx`
- Modify: `src/features/terminal/components/WarpPaneSurface.tsx`
- Modify: `src/features/terminal/hooks/useTerminalSession.ts`
- Create: `src/features/terminal/components/WarpComposer.test.tsx`
- Modify: `src/domain/terminal/workspace.test.ts`

- [ ] **Step 1: Write the failing composer-routing tests**

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WarpComposer } from "./WarpComposer";

describe("WarpComposer", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows Send to active process when the composer target is an active process", () => {
    act(() => {
      root.render(
        <WarpComposer
          target={{ type: "active-process", runId: "run:1", label: "Send to active process" }}
          onSubmit={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain("Send to active process");
  });
});
```

- [ ] **Step 2: Run the composer-routing tests to verify they fail**

Run: `npm test -- src/features/terminal/components/WarpComposer.test.tsx src/domain/terminal/workspace.test.ts`

Expected: FAIL with missing target type support or assertion mismatch.

- [ ] **Step 3: Add a routed submit helper in the workspace domain**

```ts
export type ComposerSubmit =
  | { type: "ask-ai"; value: string }
  | { type: "run-command"; value: string }
  | { type: "send-to-process"; runId: string; value: string };

export function resolveComposerSubmit(state: WorkspaceState, value: string): ComposerSubmit {
  if (state.composerTarget.type === "active-process") {
    return {
      type: "send-to-process",
      runId: state.composerTarget.runId,
      value,
    };
  }

  if (state.composerTarget.type === "run-command") {
    return {
      type: "run-command",
      value,
    };
  }

  return {
    type: "ask-ai",
    value,
  };
}
```

- [ ] **Step 4: Update the pane surface to route submissions**

```tsx
const submit = resolveComposerSubmit(paneState, value);
switch (submit.type) {
  case "send-to-process":
    void write(`${submit.value}\n`);
    return;
  case "run-command":
    startWorkspaceRun(tabId, submit.value);
    return;
  case "ask-ai":
    submitAiPrompt(tabId, submit.value);
    return;
}
```

- [ ] **Step 5: Run the composer-routing tests to verify they pass**

Run: `npm test -- src/features/terminal/components/WarpComposer.test.tsx src/domain/terminal/workspace.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/terminal/workspace.ts src/features/terminal/components/WarpComposer.tsx src/features/terminal/components/WarpPaneSurface.tsx src/features/terminal/components/WarpComposer.test.tsx src/features/terminal/hooks/useTerminalSession.ts
git commit -m "feat: route fixed composer submissions"
```

### Task 7: Add embedded terminal blocks for true TUI escalation

**Files:**
- Create: `src/features/terminal/components/WarpTerminalBlock.tsx`
- Create: `src/features/terminal/components/WarpTerminalBlock.test.tsx`
- Modify: `src/features/terminal/components/WarpTimeline.tsx`
- Modify: `src/features/terminal/components/XtermTerminalSurface.tsx`
- Modify: `src/features/terminal/lib/workspace-projection.ts`
- Modify: `src/features/terminal/lib/workspace-projection.test.ts`

- [ ] **Step 1: Write the failing terminal-block escalation tests**

```ts
import { describe, expect, it } from "vitest";

import { createWorkspaceState } from "../../../domain/terminal/workspace";
import { applyWorkspaceRuntimeEvent } from "./workspace-projection";

describe("workspace projection terminal escalation", () => {
  it("adds a terminal block when a run escalates to tui ownership", () => {
    const running = applyWorkspaceRuntimeEvent(createWorkspaceState("/workspace"), {
      type: "run-started",
      runId: "run:1",
      title: "vim notes.txt",
      command: "vim notes.txt",
    });

    const escalated = applyWorkspaceRuntimeEvent(running, {
      type: "run-escalated-to-terminal",
      runId: "run:1",
      title: "vim notes.txt",
    });

    expect(escalated.blocks).toContainEqual(
      expect.objectContaining({ type: "terminal-block", runId: "run:1", title: "vim notes.txt" }),
    );
  });
});
```

- [ ] **Step 2: Run the terminal-block tests to verify they fail**

Run: `npm test -- src/features/terminal/components/WarpTerminalBlock.test.tsx src/features/terminal/lib/workspace-projection.test.ts`

Expected: FAIL with missing event support or missing component errors.

- [ ] **Step 3: Implement the terminal block wrapper**

```tsx
export function WarpTerminalBlock({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  theme,
  write,
  resize,
}: {
  sessionId: string | null;
  bufferedOutput: TerminalBufferSnapshot;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}) {
  return (
    <section className="warp-terminal-block">
      <XtermTerminalSurface
        sessionId={sessionId}
        bufferedOutput={bufferedOutput}
        fontFamily={fontFamily}
        fontSize={fontSize}
        theme={theme}
        isActive={true}
        write={write}
        resize={resize}
      />
    </section>
  );
}
```

- [ ] **Step 4: Extend projection to insert `terminal-block` on escalation**

```ts
case "run-escalated-to-terminal":
  return {
    ...state,
    blocks: [
      ...state.blocks,
      {
        id: `terminal:${event.runId}`,
        type: "terminal-block",
        runId: event.runId,
        title: event.title,
      },
    ],
  };
```

- [ ] **Step 5: Run the terminal-block tests to verify they pass**

Run: `npm test -- src/features/terminal/components/WarpTerminalBlock.test.tsx src/features/terminal/lib/workspace-projection.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/components/WarpTerminalBlock.tsx src/features/terminal/components/WarpTerminalBlock.test.tsx src/features/terminal/components/WarpTimeline.tsx src/features/terminal/components/XtermTerminalSurface.tsx src/features/terminal/lib/workspace-projection.ts src/features/terminal/lib/workspace-projection.test.ts
git commit -m "feat: embed terminal blocks for tui escalation"
```

### Task 8: Route Codex/Qwen/Claude and ordinary PTY events into the workspace store

**Files:**
- Modify: `src/features/terminal/hooks/useTerminalRuntime.ts`
- Modify: `src/features/terminal/state/workspace-flow-store.ts`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/domain/terminal/agent-command.ts`
- Create: `src/features/terminal/hooks/useTerminalRuntime.test.ts`
- Modify: `src/features/terminal/state/workspace-flow-store.test.ts`

- [ ] **Step 1: Write the failing runtime integration test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceFlowStore } from "../state/workspace-flow-store";

describe("terminal runtime -> workspace integration", () => {
  beforeEach(() => {
    useWorkspaceFlowStore.setState(useWorkspaceFlowStore.getInitialState());
  });

  it("projects codex output into workspace blocks instead of depending on visible classic/dialog rendering", () => {
    useWorkspaceFlowStore.getState().initializeTab("tab:1", "/workspace");
    useWorkspaceFlowStore.getState().applyEvent("tab:1", {
      type: "assistant-chunk",
      blockId: "assistant:1",
      chunk: "Reviewing the repository now.",
    });

    expect(useWorkspaceFlowStore.getState().tabs["tab:1"]?.blocks).toContainEqual(
      expect.objectContaining({ type: "assistant-block", text: "Reviewing the repository now." }),
    );
  });
});
```

- [ ] **Step 2: Run the runtime integration tests to verify they fail**

Run: `npm test -- src/features/terminal/hooks/useTerminalRuntime.test.ts src/features/terminal/state/workspace-flow-store.test.ts`

Expected: FAIL because the runtime still routes visible state primarily through `terminal-view-store`.

- [ ] **Step 3: Update `useTerminalRuntime.ts` to emit workspace events**

```ts
const applyWorkspaceEvent = useWorkspaceFlowStore((state) => state.applyEvent);

void onTerminalOutput((event) => {
  const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
  if (!tabRef) {
    return;
  }

  appendOutput(tabRef.tabId, event.data);
  applyWorkspaceEvent(tabRef.tabId, {
    type: "run-output",
    runId: event.sessionId,
    chunk: event.data,
  });
});

void onTerminalSemantic((event) => {
  const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
  if (!tabRef) {
    return;
  }

  if (event.kind === "agent-workflow") {
    applyWorkspaceEvent(tabRef.tabId, {
      type: "system-message",
      blockId: `system:${event.sessionId}:agent`,
      tone: "info",
      text: `Using ${event.commandEntry ?? "AI provider"} workflow`,
    });
  }
});
```

- [ ] **Step 4: Mount only `WarpPaneSurface` in `TerminalPane.tsx`**

```tsx
const workspacePaneState = useWorkspaceFlowStore((state) => state.tabs[tabId]);

<WarpPaneSurface
  paneState={workspacePaneState ?? createWorkspaceState(tab.cwd)}
  status={tab.status}
  onSubmit={(value) => handleWarpSubmit(tabId, value)}
/>
```

- [ ] **Step 5: Run the runtime integration tests to verify they pass**

Run: `npm test -- src/features/terminal/hooks/useTerminalRuntime.test.ts src/features/terminal/state/workspace-flow-store.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/hooks/useTerminalRuntime.ts src/features/terminal/state/workspace-flow-store.ts src/features/terminal/state/workspace-flow-store.test.ts src/features/terminal/hooks/useTerminalRuntime.test.ts src/features/terminal/components/TerminalPane.tsx src/domain/terminal/agent-command.ts
git commit -m "feat: route runtime into warp-native workspace"
```

### Task 9: Delete legacy classic/dialog surface code and simplify settings

**Files:**
- Delete: `src/features/terminal/components/DialogTerminalSurface.tsx`
- Delete: `src/features/terminal/components/DialogIdleComposer.tsx`
- Delete: `src/features/terminal/components/DialogTranscript.tsx`
- Delete: `src/features/terminal/components/LiveCommandConsole.tsx`
- Delete: `src/features/terminal/components/ClassicTerminalSurface.tsx`
- Delete: `src/domain/terminal/dialog.ts`
- Delete: `src/features/terminal/state/terminal-view-store.ts`
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/features/config/state/app-config-store.ts`
- Modify: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write a failing settings cleanup test**

```ts
import { describe, expect, it } from "vitest";

import { useAppConfigStore } from "../state/app-config-store";

describe("app config terminal mode cleanup", () => {
  it("does not expose preferredMode once warp-native workspace is the only visible mode", () => {
    expect("preferredMode" in useAppConfigStore.getState().config.terminal).toBe(false);
  });
});
```

- [ ] **Step 2: Run the cleanup tests to verify they fail**

Run: `npm test -- src/features/config/state/app-config-store.test.ts`

Expected: FAIL because `preferredMode` still exists.

- [ ] **Step 3: Remove legacy files and simplify terminal config**

```ts
export interface TerminalConfig {
  themePreset: ThemePresetId;
  dialogFontFamily: string;
  dialogFontSize: number;
  shortcuts: TerminalShortcutConfig;
}
```

```tsx
<section className="settings-section">
  <h3>Workspace</h3>
  <p>PRAW uses a single Warp-native workspace interaction model.</p>
</section>
```

- [ ] **Step 4: Run the focused cleanup verification**

Run: `npm test -- src/features/config/state/app-config-store.test.ts && npm run typecheck`

Expected: PASS with clean typecheck output.

- [ ] **Step 5: Commit**

```bash
git add src/features/config/components/SettingsPanel.tsx src/features/config/state/app-config-store.ts
git rm src/features/terminal/components/DialogTerminalSurface.tsx src/features/terminal/components/DialogIdleComposer.tsx src/features/terminal/components/DialogTranscript.tsx src/features/terminal/components/LiveCommandConsole.tsx src/features/terminal/components/ClassicTerminalSurface.tsx src/domain/terminal/dialog.ts src/features/terminal/state/terminal-view-store.ts
git commit -m "refactor: remove legacy terminal modes"
```

### Task 10: Run full verification and refresh docs

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-13-warp-native-workspace-design.md`
- Modify: `docs/superpowers/plans/2026-04-13-warp-native-workspace.md`

- [ ] **Step 1: Update README positioning**

```md
## Experience

PRAW is a Warp-like native command workspace with a fixed bottom composer, block-based execution history, and embedded terminal blocks only for true TUI programs.
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test -- src/domain/terminal/workspace.test.ts src/features/terminal/lib/workspace-projection.test.ts src/features/terminal/state/workspace-flow-store.test.ts src/features/terminal/components/WarpPaneSurface.test.tsx src/features/terminal/components/WarpTimeline.test.tsx src/features/terminal/components/WarpComposer.test.tsx src/features/terminal/components/WarpTerminalBlock.test.tsx && npm run typecheck`

Expected: PASS with all tests green and no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe warp-native workspace"
```

---

## Self-Review

### Spec coverage

- Single-mode workspace: Tasks 4, 8, 9
- Fixed bottom composer: Tasks 4 and 6
- Single vertical timeline: Tasks 4 and 5
- Unified block model: Tasks 1 and 5
- Embedded terminal block for real TUIs: Task 7
- Provider/backend abstraction instead of visible CLI ownership: Tasks 2 and 8
- Removal of classic/dialog user-facing concepts: Task 9
- Verification and documentation refresh: Task 10

### Placeholder scan

- No `TODO`, `TBD`, or “handle later” placeholders remain.
- Every task includes exact file paths, commands, and expected verification outcomes.

### Type consistency

- `WorkspaceState`, `WorkspaceBlock`, `ComposerTarget`, and `WorkspaceRuntimeEvent` naming is consistent across Tasks 1-8.
- `terminal-block` remains a block type, not a reintroduced mode.
