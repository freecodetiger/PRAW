# Pane Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible pane focus mode that collapses the workspace to the active pane, blocks layout mutation while focused, and restores the exact pre-focus layout on exit.

**Architecture:** Keep focus mode as workspace state, not a render trick. `workspace-store` owns the reversible snapshot and all mutation guardrails, `TerminalWorkspace` only reflects focus-mode chrome, `TerminalPane` exposes enter/exit affordances, and `App` persists the unfocused snapshot source so restart never serializes the temporary focused layout.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, jsdom, CSS

---

## File Structure

- Modify: `src/domain/config/terminal-shortcuts.ts`
  Responsibility: add a dedicated configurable focus toggle shortcut.
- Modify: `src/domain/terminal/shortcuts.ts`
  Responsibility: resolve the focus toggle action from the configured shortcut.
- Modify: `src/domain/terminal/shortcuts.test.ts`
  Responsibility: verify shortcut resolution behavior.
- Modify: `src/features/config/components/SettingsPanel.tsx`
  Responsibility: expose the new shortcut in Settings.
- Modify: `src/features/config/lib/settings-panel-copy.ts`
  Responsibility: provide bilingual label copy for the shortcut.
- Modify: `src/features/config/lib/settings-panel-copy.test.ts`
  Responsibility: lock the copy contract.
- Modify: `src/features/config/state/app-config-store.test.ts`
  Responsibility: verify shortcut config patching still normalizes correctly.
- Modify: `src/features/terminal/state/workspace-store.ts`
  Responsibility: own focus-mode snapshot state, enter/exit/toggle actions, layout mutation guardrails, and a persistence-safe selector.
- Modify: `src/features/terminal/state/workspace-store.test.ts`
  Responsibility: verify reversible focus semantics and blocked operations.
- Modify: `src/app/App.tsx`
  Responsibility: save the unfocused workspace snapshot even while focus mode is active.
- Create: `src/app/App.test.tsx`
  Responsibility: prove persisted snapshots ignore temporary focus mode.
- Modify: `src/features/terminal/hooks/useWorkspaceShortcuts.ts`
  Responsibility: dispatch the new focus toggle action.
- Modify: `src/features/terminal/lib/pane-actions.ts`
  Responsibility: add the focus menu action and focus-aware disabled states.
- Modify: `src/features/terminal/lib/pane-actions.test.ts`
  Responsibility: verify menu order and labels in and out of focus mode.
- Modify: `src/features/terminal/components/TerminalPane.tsx`
  Responsibility: disable split/close affordances in focus mode, wire menu action dispatch, and show focus-state chrome.
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
  Responsibility: verify focus action plumbing and disabled pane controls.
- Modify: `src/features/terminal/components/TerminalWorkspace.tsx`
  Responsibility: add a workspace-level focus-mode CSS class.
- Create: `src/features/terminal/components/TerminalWorkspace.test.tsx`
  Responsibility: verify workspace root focus styling state.
- Modify: `src/app/styles.css`
  Responsibility: style workspace focus chrome and pane focus badge.
- Modify: `src/app/styles.test.ts`
  Responsibility: lock the CSS contract for focus mode.

### Task 1: Add Focus Shortcut Configuration And Settings Surface

**Files:**
- Modify: `src/domain/config/terminal-shortcuts.ts`
- Modify: `src/domain/terminal/shortcuts.ts`
- Modify: `src/domain/terminal/shortcuts.test.ts`
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/features/config/lib/settings-panel-copy.ts`
- Modify: `src/features/config/lib/settings-panel-copy.test.ts`
- Modify: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write failing tests for the new shortcut config, shortcut resolution, and settings copy**

Add these assertions:

In `src/domain/terminal/shortcuts.test.ts`:

```ts
it("resolves the configured focus toggle shortcut", () => {
  expect(
    resolveWorkspaceShortcut(
      {
        key: "Enter",
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      },
      DEFAULT_TERMINAL_SHORTCUTS,
    ),
  ).toEqual({ type: "toggle-focus-pane" });
});
```

In `src/features/config/state/app-config-store.test.ts`:

```ts
it("patches the focus toggle shortcut through the app config store", () => {
  useAppConfigStore.getState().patchTerminalConfig({
    shortcuts: {
      splitRight: { key: "=", ctrl: true, alt: true, shift: false, meta: false },
      splitDown: { key: "-", ctrl: true, alt: true, shift: false, meta: false },
      editNote: null,
      toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
    } as never,
  });

  expect(useAppConfigStore.getState().config.terminal.shortcuts).toEqual({
    splitRight: { key: "=", ctrl: true, alt: true, shift: false, meta: false },
    splitDown: { key: "-", ctrl: true, alt: true, shift: false, meta: false },
    editNote: null,
    toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
  });
});
```

In `src/features/config/lib/settings-panel-copy.test.ts`:

```ts
it("includes a focus-pane shortcut label in both locales", () => {
  expect(getSettingsPanelCopy("en").terminal.shortcutLabels.toggleFocusPane).toBe("Toggle Focus Pane");
  expect(getSettingsPanelCopy("zh-CN").terminal.shortcutLabels.toggleFocusPane).toBe("切换聚焦分屏");
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- src/domain/terminal/shortcuts.test.ts src/features/config/state/app-config-store.test.ts src/features/config/lib/settings-panel-copy.test.ts
```

Expected: FAIL because `toggleFocusPane` does not exist in `TerminalShortcutConfig`, there is no `toggle-focus-pane` workspace action, and settings copy has no label for it.

- [ ] **Step 3: Add the new shortcut key to the config model**

In `src/domain/config/terminal-shortcuts.ts`, update the interface and defaults:

```ts
export interface TerminalShortcutConfig {
  splitRight: ShortcutBinding | null;
  splitDown: ShortcutBinding | null;
  editNote: ShortcutBinding | null;
  toggleFocusPane: ShortcutBinding | null;
}

export const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutConfig = {
  splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
  splitDown: { key: "]", ctrl: true, alt: true, shift: false, meta: false },
  editNote: { key: "\\", ctrl: true, alt: true, shift: false, meta: false },
  toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
};
```

Also update `normalizeTerminalShortcutConfig(...)` and `cloneShortcutConfig(...)` to include `toggleFocusPane`.

- [ ] **Step 4: Add focus toggle workspace shortcut resolution**

In `src/domain/terminal/shortcuts.ts`, extend the action union and resolver:

```ts
export type WorkspaceShortcutAction =
  | { type: "focus-pane"; direction: FocusDirection }
  | { type: "split-right" }
  | { type: "split-down" }
  | { type: "edit-note" }
  | { type: "toggle-focus-pane" };
```

And in `resolvePaneActionShortcut(...)`:

```ts
  if (matchesShortcutBinding(event, shortcuts.toggleFocusPane)) {
    return { type: "toggle-focus-pane" };
  }
```

- [ ] **Step 5: Surface the shortcut in Settings**

In `src/features/config/components/SettingsPanel.tsx`, extend the configurable shortcut list:

```ts
const SHORTCUT_KEYS: TerminalShortcutConfigKey[] = ["splitRight", "splitDown", "editNote", "toggleFocusPane"];
```

In `src/features/config/lib/settings-panel-copy.ts`, extend both locales:

```ts
shortcutLabels: {
  splitRight: string;
  splitDown: string;
  editNote: string;
  toggleFocusPane: string;
};
```

English:

```ts
toggleFocusPane: "Toggle Focus Pane",
```

Chinese:

```ts
toggleFocusPane: "切换聚焦分屏",
```

- [ ] **Step 6: Re-run the focused tests and verify they pass**

Run:

```bash
npm test -- src/domain/terminal/shortcuts.test.ts src/features/config/state/app-config-store.test.ts src/features/config/lib/settings-panel-copy.test.ts
```

Expected: PASS with the new shortcut config, resolution, and localized label in place.

- [ ] **Step 7: Commit the shortcut/config plumbing**

Run:

```bash
git add src/domain/config/terminal-shortcuts.ts src/domain/terminal/shortcuts.ts src/domain/terminal/shortcuts.test.ts src/features/config/components/SettingsPanel.tsx src/features/config/lib/settings-panel-copy.ts src/features/config/lib/settings-panel-copy.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "feat: add pane focus shortcut config"
```

### Task 2: Implement Reversible Focus Mode In The Workspace Store

**Files:**
- Modify: `src/features/terminal/state/workspace-store.ts`
- Modify: `src/features/terminal/state/workspace-store.test.ts`

- [ ] **Step 1: Write failing store tests for enter, exit, guardrails, and persistence-safe selection**

Add these tests to `src/features/terminal/state/workspace-store.test.ts`:

```ts
import { createLeafLayout } from "../../../domain/layout/tree";
import { selectWindowForPersistence, useWorkspaceStore } from "./workspace-store";
```

```ts
it("enters focus mode with a reversible layout snapshot and restores it on exit", () => {
  useWorkspaceStore.getState().bootstrapWindow({
    shell: "/bin/bash",
    cwd: "~",
  });

  useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
  const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;

  useWorkspaceStore.getState().enterFocusMode("tab:2");
  expect(useWorkspaceStore.getState().focusMode).toMatchObject({
    focusedTabId: "tab:2",
    activeTabIdBeforeFocus: "tab:2",
  });
  expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("tab:2"));

  useWorkspaceStore.getState().exitFocusMode();
  expect(useWorkspaceStore.getState().window?.layout).toEqual(layoutBeforeFocus);
  expect(useWorkspaceStore.getState().focusMode).toBeNull();
});

it("blocks split, close, drag preview, resize, and adjacent focus while focus mode is active", () => {
  useWorkspaceStore.getState().bootstrapWindow({
    shell: "/bin/bash",
    cwd: "~",
  });

  useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
  const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;
  useWorkspaceStore.getState().enterFocusMode("tab:2");

  useWorkspaceStore.getState().splitActiveTab("vertical");
  useWorkspaceStore.getState().focusAdjacentTab("left");
  useWorkspaceStore.getState().beginTabDrag("tab:2");
  useWorkspaceStore.getState().setDragPreview("tab:2", "left");
  useWorkspaceStore.getState().applyDragPreview();
  useWorkspaceStore.getState().closeTab("tab:2");

  expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("tab:2"));
  expect(useWorkspaceStore.getState().window?.tabs["tab:1"]).toBeDefined();
  expect(useWorkspaceStore.getState().window?.activeTabId).toBe("tab:2");
  expect(selectWindowForPersistence(useWorkspaceStore.getState())?.layout).toEqual(layoutBeforeFocus);
});

it("does not overwrite the original focus snapshot on repeated enter attempts", () => {
  useWorkspaceStore.getState().bootstrapWindow({
    shell: "/bin/bash",
    cwd: "~",
  });

  useWorkspaceStore.getState().splitTab("tab:1", "horizontal");
  const layoutBeforeFocus = useWorkspaceStore.getState().window!.layout;

  useWorkspaceStore.getState().enterFocusMode("tab:2");
  useWorkspaceStore.getState().enterFocusMode("tab:1");

  expect(useWorkspaceStore.getState().focusMode?.layoutBeforeFocus).toEqual(layoutBeforeFocus);
  expect(useWorkspaceStore.getState().window?.layout).toEqual(createLeafLayout("tab:2"));
});
```

- [ ] **Step 2: Run the store tests and verify they fail**

Run:

```bash
npm test -- src/features/terminal/state/workspace-store.test.ts
```

Expected: FAIL because `focusMode`, `enterFocusMode`, `exitFocusMode`, and `selectWindowForPersistence` do not exist.

- [ ] **Step 3: Add focus-mode state, actions, and selectors to the store**

In `src/features/terminal/state/workspace-store.ts`, add the focus-mode type and store fields:

```ts
interface WorkspaceFocusMode {
  focusedTabId: string;
  layoutBeforeFocus: LayoutNode;
  activeTabIdBeforeFocus: string;
}

interface WorkspaceStore {
  window: WindowModel | null;
  focusMode: WorkspaceFocusMode | null;
  dragState: { sourceTabId: string } | null;
  dragPreview: PaneDragPreview | null;
  noteEditorTabId: string | null;
  enterFocusMode: (tabId: string) => void;
  exitFocusMode: () => void;
  toggleFocusMode: (tabId: string) => void;
}
```

Initialize and reset it in `bootstrapWindow` and `hydrateWindow`:

```ts
focusMode: null,
```

Add the actions:

```ts
  enterFocusMode: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId] || state.focusMode) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: createLeafLayout(tabId),
          activeTabId: tabId,
        },
        focusMode: {
          focusedTabId: tabId,
          layoutBeforeFocus: state.window.layout,
          activeTabIdBeforeFocus: state.window.activeTabId,
        },
        dragState: null,
        dragPreview: null,
      };
    }),

  exitFocusMode: () =>
    set((state) => {
      if (!state.window || !state.focusMode) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: state.focusMode.layoutBeforeFocus,
          activeTabId: state.focusMode.activeTabIdBeforeFocus,
        },
        focusMode: null,
        dragState: null,
        dragPreview: null,
      };
    }),

  toggleFocusMode: (tabId) =>
    set((state) => {
      if (!state.window?.tabs[tabId]) {
        return state;
      }

      if (!state.focusMode) {
        return {
          window: {
            ...state.window,
            layout: createLeafLayout(tabId),
            activeTabId: tabId,
          },
          focusMode: {
            focusedTabId: tabId,
            layoutBeforeFocus: state.window.layout,
            activeTabIdBeforeFocus: state.window.activeTabId,
          },
          dragState: null,
          dragPreview: null,
        };
      }

      if (state.focusMode.focusedTabId !== tabId) {
        return state;
      }

      return {
        window: {
          ...state.window,
          layout: state.focusMode.layoutBeforeFocus,
          activeTabId: state.focusMode.activeTabIdBeforeFocus,
        },
        focusMode: null,
        dragState: null,
        dragPreview: null,
      };
    }),
```

- [ ] **Step 4: Guard layout-mutating actions while focused and add a persistence-safe selector**

In the layout-mutating actions, early-return when `state.focusMode` is active:

```ts
  splitTab: (tabId, axis) =>
    set((state) => {
      if (state.focusMode || !state.window?.tabs[tabId]) {
        return state;
      }
      return splitWindowTab(state, tabId, axis);
    }),
```

Apply the same pattern to:

```ts
splitActiveTab
resizeSplit
focusAdjacentTab
closeTab
beginTabDrag
setDragPreview
applyDragPreview
```

Then export a selector:

```ts
export function selectWindowForPersistence(
  state: Pick<WorkspaceStore, "window" | "focusMode">,
): WindowModel | null {
  if (!state.window) {
    return null;
  }

  if (!state.focusMode) {
    return state.window;
  }

  return {
    ...state.window,
    layout: state.focusMode.layoutBeforeFocus,
    activeTabId: state.focusMode.activeTabIdBeforeFocus,
  };
}
```

- [ ] **Step 5: Re-run the store tests and verify they pass**

Run:

```bash
npm test -- src/features/terminal/state/workspace-store.test.ts
```

Expected: PASS with reversible focus behavior and blocked layout mutations.

- [ ] **Step 6: Commit the store implementation**

Run:

```bash
git add src/features/terminal/state/workspace-store.ts src/features/terminal/state/workspace-store.test.ts
git commit -m "feat: add reversible pane focus state"
```

### Task 3: Prevent Persistence Of Temporary Focus Layouts

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`

- [ ] **Step 1: Write a failing App test that proves persistence uses the unfocused layout**

Create `src/app/App.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "../features/terminal/state/workspace-store";
import App from "./App";

const bootstrapApi = vi.hoisted(() => ({
  loadAppBootstrapState: vi.fn(async () => ({
    config: null,
    windowSnapshot: {
      version: 2,
      layout: {
        kind: "container",
        id: "root",
        axis: "horizontal",
        children: [
          { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
          { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        ],
        sizes: [1, 1],
      },
      tabs: [
        { tabId: "tab:1", title: "Tab 1", shell: "/bin/bash", cwd: "/workspace" },
        { tabId: "tab:2", title: "Tab 2", shell: "/bin/bash", cwd: "/workspace" },
      ],
      activeTabId: "tab:2",
      nextTabNumber: 3,
    },
  })),
  saveAppConfig: vi.fn(async () => undefined),
  saveWindowSnapshot: vi.fn(async () => undefined),
}));

vi.mock("../lib/tauri/bootstrap", () => bootstrapApi);
vi.mock("../features/terminal/hooks/useTerminalRuntime", () => ({
  useTerminalRuntime: () => undefined,
}));
vi.mock("../features/config/components/SettingsPanel", () => ({
  SettingsPanel: () => <div data-testid="settings-panel" />,
}));
vi.mock("../features/terminal/components/TerminalWorkspace", () => ({
  TerminalWorkspace: () => <div data-testid="workspace" />,
}));

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
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

  it("persists the pre-focus layout even while focus mode is active", async () => {
    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useWorkspaceStore.getState().enterFocusMode("tab:2");
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(bootstrapApi.saveWindowSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layout: {
          kind: "container",
          id: "root",
          axis: "horizontal",
          children: [
            { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
            { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
          ],
          sizes: [1, 1],
        },
        activeTabId: "tab:2",
      }),
    );
  });
});
```

- [ ] **Step 2: Run the new App test and verify it fails**

Run:

```bash
npm test -- src/app/App.test.tsx
```

Expected: FAIL because `App` currently serializes `windowModel` directly, which becomes the focused single-pane layout after `enterFocusMode(...)`.

- [ ] **Step 3: Use the persistence-safe selector in App**

In `src/app/App.tsx`, import the selector:

```ts
import { selectWindowForPersistence, useWorkspaceStore } from "../features/terminal/state/workspace-store";
```

Read the selector alongside `windowModel`:

```ts
const persistedWindowModel = useWorkspaceStore(selectWindowForPersistence);
```

Then update the save effect:

```ts
  useEffect(() => {
    if (bootState === "loading" || !persistedWindowModel) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWindowSnapshot(toWindowSnapshot(persistedWindowModel));
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bootState, persistedWindowModel]);
```

- [ ] **Step 4: Re-run the App and store tests**

Run:

```bash
npm test -- src/app/App.test.tsx src/features/terminal/state/workspace-store.test.ts
```

Expected: PASS with the persisted snapshot staying unfocused even while focus mode is active in memory.

- [ ] **Step 5: Commit the persistence fix**

Run:

```bash
git add src/app/App.tsx src/app/App.test.tsx
git commit -m "fix: persist unfocused workspace snapshots"
```

### Task 4: Wire Focus Mode Through Pane Actions, Shortcuts, And Workspace Chrome

**Files:**
- Modify: `src/features/terminal/hooks/useWorkspaceShortcuts.ts`
- Modify: `src/features/terminal/lib/pane-actions.ts`
- Modify: `src/features/terminal/lib/pane-actions.test.ts`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `src/features/terminal/components/TerminalWorkspace.tsx`
- Create: `src/features/terminal/components/TerminalWorkspace.test.tsx`
- Modify: `src/app/styles.css`
- Modify: `src/app/styles.test.ts`

- [ ] **Step 1: Write failing action and UI tests for focus affordances**

In `src/features/terminal/lib/pane-actions.test.ts`, add:

```ts
it("adds a focus action that flips to exit focus when the pane is focused", () => {
  expect(
    resolvePaneActions({
      canClose: true,
      isFocusModeActive: false,
      isFocusedPane: false,
    }),
  ).toEqual([
    { id: "edit-note", label: "Edit Note", disabled: false },
    { id: "focus-pane", label: "Focus Pane", disabled: false },
    { id: "close-tab", label: "Close Tab", disabled: false },
    { id: "restart-shell", label: "Restart Shell", disabled: false },
  ]);

  expect(
    resolvePaneActions({
      canClose: true,
      isFocusModeActive: true,
      isFocusedPane: true,
    }),
  ).toEqual([
    { id: "edit-note", label: "Edit Note", disabled: false },
    { id: "focus-pane", label: "Exit Focus", disabled: false },
    { id: "close-tab", label: "Close Tab", disabled: true },
    { id: "restart-shell", label: "Restart Shell", disabled: false },
  ]);
});
```

In `src/features/terminal/components/TerminalPane.test.tsx`, replace the `PaneHeaderActionCluster` mock with a prop-capturing version:

```tsx
let latestPaneHeaderActionClusterProps: Record<string, unknown> | null = null;

vi.mock("./PaneHeaderActionCluster", () => ({
  PaneHeaderActionCluster: (props: Record<string, unknown>) => {
    latestPaneHeaderActionClusterProps = props;
    return <div data-testid="pane-header-actions" />;
  },
}));
```

Then add:

```tsx
it("offers a focus menu action and toggles focus mode through the pane header action callback", async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    window: {
      ...state.window!,
      layout: {
        kind: "container",
        id: "root",
        axis: "horizontal",
        children: [
          { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
          { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        ],
        sizes: [1, 1],
      },
      tabs: {
        ...state.window!.tabs,
        "tab:2": {
          tabId: "tab:2",
          title: "Tab 2",
          shell: "/bin/bash",
          cwd: "/workspace",
          status: "running",
          sessionId: "session-2",
        },
      },
      activeTabId: "tab:1",
      nextTabNumber: 3,
    },
  }));

  await act(async () => {
    root.render(<TerminalPane tabId="tab:1" />);
  });

  expect(latestPaneHeaderActionClusterProps?.menuActions).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "focus-pane", label: "Focus Pane" })]),
  );

  await act(async () => {
    (latestPaneHeaderActionClusterProps?.onMenuSelect as (id: string) => void)("focus-pane");
  });

  expect(useWorkspaceStore.getState().focusMode?.focusedTabId).toBe("tab:1");
  expect(useWorkspaceStore.getState().window?.layout).toEqual({
    kind: "pane",
    id: "pane:tab:1",
    paneId: "tab:1",
  });
});

it("disables split and close controls and shows focused chrome while focus mode is active", async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    focusMode: {
      focusedTabId: "tab:1",
      layoutBeforeFocus: {
        kind: "container",
        id: "root",
        axis: "horizontal",
        children: [
          { kind: "pane", id: "pane:tab:1", paneId: "tab:1" },
          { kind: "pane", id: "pane:tab:2", paneId: "tab:2" },
        ],
        sizes: [1, 1],
      },
      activeTabIdBeforeFocus: "tab:1",
    },
  }));

  await act(async () => {
    root.render(<TerminalPane tabId="tab:1" />);
  });

  expect(latestPaneHeaderActionClusterProps?.canSplitRight).toBe(false);
  expect(latestPaneHeaderActionClusterProps?.canSplitDown).toBe(false);
  expect(latestPaneHeaderActionClusterProps?.canClose).toBe(false);
  expect(host.textContent).toContain("FOCUSED");
});
```

Create `src/features/terminal/components/TerminalWorkspace.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "../state/workspace-store";
import { TerminalWorkspace } from "./TerminalWorkspace";

vi.mock("./LayoutTree", () => ({
  LayoutTree: () => <div data-testid="layout-tree" />,
}));

describe("TerminalWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    useWorkspaceStore.getState().bootstrapWindow({
      shell: "/bin/bash",
      cwd: "/workspace",
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it("adds workspace focus chrome when focus mode is active", () => {
    useWorkspaceStore.getState().enterFocusMode("tab:1");

    act(() => {
      root.render(<TerminalWorkspace />);
    });

    expect(host.querySelector(".workspace")?.className).toContain("workspace--focus-mode");
  });
});
```

- [ ] **Step 2: Run the focused UI tests and verify they fail**

Run:

```bash
npm test -- src/features/terminal/lib/pane-actions.test.ts src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/TerminalWorkspace.test.tsx
```

Expected: FAIL because there is no `focus-pane` action, no focus-mode chrome, and `TerminalPane` does not toggle or display focus state.

- [ ] **Step 3: Wire the shortcut hook and pane action model**

In `src/features/terminal/hooks/useWorkspaceShortcuts.ts`, extend the hook options:

```ts
interface UseWorkspaceShortcutsOptions {
  focusAdjacentTab: (direction: "left" | "right" | "up" | "down") => void;
  splitActiveTab: (axis: "horizontal" | "vertical") => void;
  requestEditNoteForActiveTab: () => void;
  toggleFocusPane: () => void;
  shortcuts: TerminalShortcutConfig;
}
```

Route the new action:

```ts
        case "toggle-focus-pane":
          toggleFocusPane();
          return;
```

In `src/features/terminal/lib/pane-actions.ts`, add the new menu action:

```ts
export type PaneActionId = "edit-note" | "focus-pane" | "close-tab" | "restart-shell";

interface ResolvePaneActionsInput {
  canClose: boolean;
  isFocusModeActive: boolean;
  isFocusedPane: boolean;
}

export function resolvePaneActions({
  canClose,
  isFocusModeActive,
  isFocusedPane,
}: ResolvePaneActionsInput): PaneAction[] {
  return [
    {
      id: "edit-note",
      label: "Edit Note",
      disabled: false,
    },
    {
      id: "focus-pane",
      label: isFocusedPane ? "Exit Focus" : "Focus Pane",
      disabled: false,
    },
    {
      id: "close-tab",
      label: "Close Tab",
      disabled: !canClose || isFocusModeActive,
    },
    {
      id: "restart-shell",
      label: "Restart Shell",
      disabled: false,
    },
  ];
}
```

- [ ] **Step 4: Integrate focus mode into `TerminalPane` and `TerminalWorkspace`**

In `src/features/terminal/components/TerminalWorkspace.tsx`, read focus state and add workspace chrome:

```tsx
  const isFocusModeActive = useWorkspaceStore((state) => state.focusMode !== null);
```

```tsx
  return (
    <section className={`workspace${isFocusModeActive ? " workspace--focus-mode" : ""}`}>
      <div ref={canvasRef} className="workspace__canvas">
        <LayoutTree node={windowModel.layout} frame={frame} />
      </div>
    </section>
  );
```

In `src/features/terminal/components/TerminalPane.tsx`, read focus state and toggle action:

```tsx
  const focusMode = useWorkspaceStore((state) => state.focusMode);
  const toggleFocusMode = useWorkspaceStore((state) => state.toggleFocusMode);
  const isFocusModeActive = focusMode !== null;
  const isFocusedPane = focusMode?.focusedTabId === tabId;
```

Disable split and close affordances while focused:

```tsx
  const canSplitHorizontal =
    !isFocusModeActive &&
    canSplitPaneAtSize("horizontal", paneSize.width, {
      preserveTrailingBoundary: !(borderMask?.right ?? false),
    });
  const canSplitVertical =
    !isFocusModeActive &&
    canSplitPaneAtSize("vertical", paneSize.height, {
      preserveTrailingBoundary: !(borderMask?.bottom ?? false),
    });
  const canClosePane = canClose && !isFocusModeActive;
```

Use the richer action resolver:

```tsx
  const paneActions = resolvePaneActions({
    canClose,
    isFocusModeActive,
    isFocusedPane,
  });
```

Handle the action:

```tsx
      case "focus-pane":
        toggleFocusMode(tabId);
        return;
```

Render focus chrome:

```tsx
        {isFocusedPane ? (
          <span className="terminal-pane__focus-badge" aria-label="Focused pane mode">
            FOCUSED
          </span>
        ) : null}
```

And pass the disabled close flag:

```tsx
          canClose={canClosePane}
```

Also update `useWorkspaceShortcuts(...)` in `TerminalWorkspace.tsx`:

```tsx
  const toggleFocusPane = useWorkspaceStore((state) => {
    const activeTabId = state.window?.activeTabId;
    return () => {
      if (!activeTabId) {
        return;
      }

      state.toggleFocusMode(activeTabId);
    };
  });
```

Pass it into the hook:

```tsx
  useWorkspaceShortcuts({
    focusAdjacentTab,
    splitActiveTab,
    requestEditNoteForActiveTab,
    toggleFocusPane,
    shortcuts,
  });
```

- [ ] **Step 5: Add CSS contract tests and implement focus-mode styling**

In `src/app/styles.test.ts`, add:

```ts
  it("defines styles for workspace focus mode chrome", () => {
    const styles = readStyles();

    expect(styles).toContain(".workspace--focus-mode");
    expect(styles).toContain(".terminal-pane__focus-badge");
  });
```

In `src/app/styles.css`, add:

```css
.workspace--focus-mode {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--surface-muted) 72%, transparent), transparent 42%);
}

.terminal-pane__focus-badge {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.12em;
}

.terminal-pane--agent-workflow .terminal-pane__focus-badge {
  border-color: var(--ai-theme-color);
  color: var(--ai-theme-color);
}
```

- [ ] **Step 6: Re-run the focused UI and style tests**

Run:

```bash
npm test -- src/features/terminal/lib/pane-actions.test.ts src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/TerminalWorkspace.test.tsx src/app/styles.test.ts
```

Expected: PASS with focus menu actions, disabled layout controls, workspace focus class, and focus badge styling in place.

- [ ] **Step 7: Commit the UI integration**

Run:

```bash
git add src/features/terminal/hooks/useWorkspaceShortcuts.ts src/features/terminal/lib/pane-actions.ts src/features/terminal/lib/pane-actions.test.ts src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/TerminalWorkspace.tsx src/features/terminal/components/TerminalWorkspace.test.tsx src/app/styles.css src/app/styles.test.ts
git commit -m "feat: add pane focus mode ui"
```

### Task 5: Final Verification

**Files:**
- Verify only: `src/app/App.tsx`
- Verify only: `src/features/terminal/state/workspace-store.ts`
- Verify only: `src/features/terminal/components/TerminalPane.tsx`
- Verify only: `src/features/terminal/components/TerminalWorkspace.tsx`

- [ ] **Step 1: Run the full focused regression suite**

Run:

```bash
npm test -- src/domain/terminal/shortcuts.test.ts src/features/config/state/app-config-store.test.ts src/features/config/lib/settings-panel-copy.test.ts src/features/terminal/state/workspace-store.test.ts src/app/App.test.tsx src/features/terminal/lib/pane-actions.test.ts src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/TerminalWorkspace.test.tsx src/app/styles.test.ts
```

Expected: PASS across shortcut config, workspace store, persistence, pane action, workspace chrome, and style contracts.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with no regressions.

- [ ] **Step 3: Run type-checking**

Run:

```bash
npm run typecheck
```

Expected: exit code `0`.

- [ ] **Step 4: Inspect the final branch state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: clean working tree and three new implementation commits on top of the design/plan docs.
