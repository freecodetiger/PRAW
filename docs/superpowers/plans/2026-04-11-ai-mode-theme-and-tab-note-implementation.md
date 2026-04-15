# AI Mode Theme And Tab Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable system tab labels plus editable notes, remove the noisy AI-mode texture and heavy split divider, and expose configurable AI mode colors in settings.

**Architecture:** Keep pane identity in the window domain model by preserving `title` as the stable system label and adding an optional `note` field. Drive pane display through a small label-formatting helper, and route AI mode styling through `ai.themeColor` and `ai.backgroundColor` in app config so the UI stays declarative and easy to extend.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, CSS, Tauri

---

## File Structure

### Existing files to modify

- `src/domain/window/types.ts`
  Add `note?: string` to `TabModel`.
- `src/domain/window/snapshot.ts`
  Persist optional tab notes in `TabSnapshot`, `toWindowSnapshot`, and `fromWindowSnapshot`.
- `src/domain/window/restore.ts`
  Normalize optional `note` from modern snapshots and default legacy snapshots to `undefined`.
- `src/domain/window/snapshot.test.ts`
  Add snapshot round-trip coverage for optional notes.
- `src/domain/window/restore.test.ts`
  Add restore normalization coverage for optional notes and missing note fallback.
- `src/features/terminal/state/workspace-store.ts`
  Replace `renameTab` with `setTabNote`.
- `src/features/terminal/state/workspace-store.test.ts`
  Update store tests to cover note trimming and clearing.
- `src/domain/config/types.ts`
  Extend `AiConfig` with `themeColor` and `backgroundColor`.
- `src/domain/config/model.ts`
  Add AI appearance defaults and normalization.
- `src/domain/config/model.test.ts`
  Cover valid and invalid AI colors.
- `src/features/config/state/app-config-store.test.ts`
  Verify AI appearance patching leaves terminal config untouched.
- `src/features/config/components/SettingsPanel.tsx`
  Replace generic AI settings block with a clear AI appearance subsection containing the two inputs.
- `src/features/terminal/components/TerminalPane.tsx`
  Edit notes instead of titles, derive visible labels from the helper, and inject AI-mode CSS variables.
- `src/features/terminal/components/LayoutTree.tsx`
  Keep resize behavior but change divider rendering so panes sit flush.
- `src/app/styles.css`
  Remove diagonal AI texture, restyle the divider to an invisible hit target or hairline, and add CSS-variable-driven AI mode visuals.

### New files to create

- `src/domain/window/label.ts`
  Expose `formatTabLabel(title: string, note?: string): string`.
- `src/domain/window/label.test.ts`
  Cover `Tab N` and `Tab N · Note` formatting behavior.

## Task 1: Add Stable Tab Notes And Display Label Helper

**Files:**
- Create: `src/domain/window/label.ts`
- Test: `src/domain/window/label.test.ts`
- Modify: `src/domain/window/types.ts`
- Modify: `src/domain/window/snapshot.ts`
- Modify: `src/domain/window/restore.ts`
- Test: `src/domain/window/snapshot.test.ts`
- Test: `src/domain/window/restore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/window/label.test.ts
import { describe, expect, it } from "vitest";
import { formatTabLabel } from "./label";

describe("formatTabLabel", () => {
  it("returns the stable title when note is missing", () => {
    expect(formatTabLabel("Tab 1")).toBe("Tab 1");
  });

  it("appends the note with a middle dot separator", () => {
    expect(formatTabLabel("Tab 1", "Build")).toBe("Tab 1 · Build");
  });
});
```

```ts
// src/domain/window/snapshot.test.ts
expect(toWindowSnapshot(windowModel)).toEqual({
  tabs: [
    {
      tabId: "tab:1",
      title: "Tab 1",
      note: "Build",
      shell: "/bin/bash",
      cwd: "~",
    },
  ],
});
```

```ts
// src/domain/window/restore.test.ts
expect(
  normalizeWindowSnapshot({
    layout: { kind: "leaf", id: "leaf:tab:1", leafId: "tab:1" },
    tabs: [{ tabId: "tab:1", title: "Tab 1", note: "Build", shell: "/bin/bash", cwd: "~" }],
    activeTabId: "tab:1",
    nextTabNumber: 2,
  }),
).toEqual({
  tabs: [{ tabId: "tab:1", title: "Tab 1", note: "Build", shell: "/bin/bash", cwd: "~" }],
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm test -- src/domain/window/label.test.ts src/domain/window/snapshot.test.ts src/domain/window/restore.test.ts
```

Expected:

```text
FAIL  src/domain/window/label.test.ts
FAIL  src/domain/window/snapshot.test.ts
FAIL  src/domain/window/restore.test.ts
```

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/domain/window/label.ts
export function formatTabLabel(title: string, note?: string): string {
  return note ? `${title} · ${note}` : title;
}
```

```ts
// src/domain/window/types.ts
export interface TabModel {
  tabId: string;
  title: string;
  note?: string;
  shell: string;
  cwd: string;
  // existing runtime fields unchanged
}
```

```ts
// src/domain/window/snapshot.ts
export interface TabSnapshot {
  tabId: string;
  title: string;
  note?: string;
  shell: string;
  cwd: string;
}
```

```ts
// src/domain/window/restore.ts
function normalizeTabSnapshot(tab: unknown): WindowSnapshot["tabs"][number] | null {
  if (!isRecord(tab) || !isNonEmptyString(tab.tabId)) {
    return null;
  }

  return {
    tabId: tab.tabId,
    title: isNonEmptyString(tab.title) ? tab.title : tab.tabId,
    note: isNonEmptyString(tab.note) ? tab.note.trim() : undefined,
    shell: isNonEmptyString(tab.shell) ? tab.shell : "/bin/bash",
    cwd: isNonEmptyString(tab.cwd) ? tab.cwd : "~",
  };
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm test -- src/domain/window/label.test.ts src/domain/window/snapshot.test.ts src/domain/window/restore.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/window/label.ts src/domain/window/label.test.ts src/domain/window/types.ts src/domain/window/snapshot.ts src/domain/window/restore.ts src/domain/window/snapshot.test.ts src/domain/window/restore.test.ts
git commit -m "feat: add stable tab labels and notes"
```

## Task 2: Replace Free Rename With Note Editing In Workspace State

**Files:**
- Modify: `src/features/terminal/state/workspace-store.ts`
- Test: `src/features/terminal/state/workspace-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("stores a trimmed tab note without changing the stable title", () => {
  useWorkspaceStore.getState().bootstrapWindow({ shell: "/bin/bash", cwd: "~" });

  useWorkspaceStore.getState().setTabNote("tab:1", "  Build  ");

  expect(selectActiveTab(useWorkspaceStore.getState())).toMatchObject({
    title: "Tab 1",
    note: "Build",
  });
});

it("clears a tab note when the normalized input is empty", () => {
  useWorkspaceStore.getState().bootstrapWindow({ shell: "/bin/bash", cwd: "~" });
  useWorkspaceStore.getState().setTabNote("tab:1", "Build");

  useWorkspaceStore.getState().setTabNote("tab:1", "   ");

  expect(selectActiveTab(useWorkspaceStore.getState())).toMatchObject({
    title: "Tab 1",
    note: undefined,
  });
});
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run:

```bash
npm test -- src/features/terminal/state/workspace-store.test.ts
```

Expected:

```text
TypeError: setTabNote is not a function
```

- [ ] **Step 3: Write the minimal implementation**

```ts
interface WorkspaceStore {
  // ...
  setTabNote: (tabId: string, note: string) => void;
}

setTabNote: (tabId, note) =>
  set((state) => {
    const normalizedNote = note.trim();

    return updateTabState(state, tabId, (tab) => {
      const nextNote = normalizedNote.length > 0 ? normalizedNote : undefined;
      if (tab.note === nextNote) {
        return tab;
      }

      return {
        ...tab,
        note: nextNote,
      };
    });
  }),
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run:

```bash
npm test -- src/features/terminal/state/workspace-store.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/state/workspace-store.ts src/features/terminal/state/workspace-store.test.ts
git commit -m "feat: switch pane renaming to notes"
```

## Task 3: Add AI Appearance Config And Settings Controls

**Files:**
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`
- Modify: `src/features/config/components/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/config/model.test.ts
it("normalizes ai appearance colors", () => {
  expect(
    resolveAppConfig({
      ai: {
        themeColor: "#2b6fff",
        backgroundColor: "invalid",
      },
    }),
  ).toEqual({
    terminal: DEFAULT_APP_CONFIG.terminal,
    ai: {
      ...DEFAULT_APP_CONFIG.ai,
      themeColor: "#2b6fff",
      backgroundColor: DEFAULT_APP_CONFIG.ai.backgroundColor,
    },
  });
});
```

```ts
// src/features/config/state/app-config-store.test.ts
it("patches ai appearance settings without disturbing terminal config", () => {
  useAppConfigStore.getState().patchAiConfig({
    themeColor: "#2b6fff",
    backgroundColor: "#eef4ff",
  });

  expect(useAppConfigStore.getState().config.ai).toMatchObject({
    themeColor: "#2b6fff",
    backgroundColor: "#eef4ff",
  });
});
```

- [ ] **Step 2: Run the config tests to verify they fail**

Run:

```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
```

Expected:

```text
FAIL  src/domain/config/model.test.ts
FAIL  src/features/config/state/app-config-store.test.ts
```

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/domain/config/types.ts
export interface AiConfig {
  provider: string;
  model: string;
  enabled: boolean;
  themeColor: string;
  backgroundColor: string;
}
```

```ts
// src/domain/config/model.ts
export const DEFAULT_APP_CONFIG: AppConfig = {
  // ...
  ai: {
    provider: "glm",
    model: "glm-5-flash",
    enabled: false,
    themeColor: "#1f5eff",
    backgroundColor: "#eef4ff",
  },
};
```

```ts
function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}
```

```tsx
// src/features/config/components/SettingsPanel.tsx
<section className="settings-section">
  <div className="settings-section__title">
    <strong>AI Appearance</strong>
    <p>These colors only affect AI workflow panes.</p>
  </div>

  <div className="settings-grid">
    <label className="settings-field">
      <span>Theme color</span>
      <input
        type="color"
        value={config.ai.themeColor}
        onChange={(event) => patchAiConfig({ themeColor: event.target.value })}
      />
    </label>

    <label className="settings-field">
      <span>Background color</span>
      <input
        type="color"
        value={config.ai.backgroundColor}
        onChange={(event) => patchAiConfig({ backgroundColor: event.target.value })}
      />
    </label>
  </div>
</section>
```

- [ ] **Step 4: Run the config tests to verify they pass**

Run:

```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/features/config/components/SettingsPanel.tsx
git commit -m "feat: add configurable ai appearance settings"
```

## Task 4: Update Pane UI For Notes And Configurable AI Mode Styling

**Files:**
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/app/styles.css`
- Modify: `src/features/terminal/components/LayoutTree.tsx`

- [ ] **Step 1: Write the failing behavioral and regression tests**

```ts
// Add to src/features/terminal/state/workspace-store.test.ts or a new pane helper test
expect(formatTabLabel("Tab 3", "Codex Refactor")).toBe("Tab 3 · Codex Refactor");
expect(formatTabLabel("Tab 3", undefined)).toBe("Tab 3");
```

```ts
// Preserve existing AI mode tests in:
// src/domain/terminal/dialog.test.ts
// src/features/terminal/state/terminal-view-store.test.ts
// No assertion changes should be needed; this task must keep them green.
```

- [ ] **Step 2: Run the relevant tests to verify the new behavior is not implemented yet**

Run:

```bash
npm test -- src/domain/window/label.test.ts src/features/terminal/state/workspace-store.test.ts src/domain/terminal/dialog.test.ts src/features/terminal/state/terminal-view-store.test.ts
```

Expected:

```text
FAIL  when TerminalPane still edits title instead of note
PASS  existing AI workflow state tests
```

- [ ] **Step 3: Write the minimal implementation**

```tsx
// src/features/terminal/components/TerminalPane.tsx
const setTabNote = useWorkspaceStore((state) => state.setTabNote);
const label = formatTabLabel(tab.title, tab.note);
const isEditingNote = useState(false);

const commitNote = () => {
  setTabNote(tabId, noteDraft);
  setIsEditingNote(false);
};
```

```tsx
// Visible label stays stable even while editing note
<div className="terminal-pane__title" title={label}>
  <strong>{label}</strong>
</div>
```

```tsx
// Context menu action
<button className="pane-context-menu__item" type="button" onClick={startEditingNote}>
  Edit Note
</button>
```

```tsx
// Inject AI colors
style={
  isAgentWorkflow
    ? ({
        "--ai-theme-color": aiThemeColor,
        "--ai-background-color": aiBackgroundColor,
      } as React.CSSProperties)
    : undefined
}
```

```css
/* src/app/styles.css */
.terminal-pane--agent-workflow {
  border-left-width: 8px;
  border-left-color: var(--ai-theme-color, #1f5eff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ai-theme-color, #1f5eff) 28%, #000 72%);
}

.terminal-pane--agent-workflow .terminal-pane__header {
  background: var(--ai-background-color, #eef4ff);
  border-bottom-color: var(--ai-theme-color, #1f5eff);
}

.terminal-pane--agent-workflow .terminal-pane__mode-indicator {
  background: var(--ai-theme-color, #1f5eff);
  border-color: var(--ai-theme-color, #1f5eff);
  color: #ffffff;
}
```

```css
/* Remove textured background */
.terminal-pane--agent-workflow .terminal-pane__body,
.terminal-pane--agent-workflow .dialog-terminal,
.terminal-pane--agent-workflow .terminal-pane__xterm {
  background-image: none;
  background-color: var(--ai-background-color, #eef4ff);
}
```

```css
/* Flush split boundary */
.layout-tree {
  gap: 0;
}

.layout-tree__divider {
  position: relative;
  flex: 0 0 0;
  width: 0;
  border: 0;
  background: transparent;
}

.layout-tree__divider::before {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-3px);
  width: 6px;
  cursor: col-resize;
}
```

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

```text
Test Files  all passed
tsc --noEmit exit 0
vite build exit 0
```

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/LayoutTree.tsx src/app/styles.css
git commit -m "feat: refresh pane notes and ai mode styling"
```

## Self-Review

### Spec coverage check

- Stable system numbering: covered by Task 1 and Task 2.
- Notes instead of free rename: covered by Task 2 and Task 4.
- Remove noisy AI texture: covered by Task 4.
- Add configurable AI mode theme/background colors: covered by Task 3 and Task 4.
- Remove heavy split divider while keeping separation: covered by Task 4.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” placeholders remain.
- Every task includes exact files, commands, and expected outcomes.

### Type consistency

- Runtime model uses `title` plus optional `note`.
- Store API is consistently named `setTabNote`.
- UI label formatting is consistently named `formatTabLabel`.
