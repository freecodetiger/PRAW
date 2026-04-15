# Pane Header Split Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote split actions into the pane header, keep them visible in an elegant right-side control cluster, and add configurable always-on shortcuts for `Split Right`, `Split Down`, and `Edit Note`.

**Architecture:** Extend terminal config with normalized pane-action shortcut bindings, route global workspace keydown events through a config-aware resolver, and restructure the pane header so split buttons become first-class controls while `...` retains only low-frequency actions. Keep note editing pane-local in the UI, but expose a store-driven trigger so a global shortcut can open the current pane's note editor.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest

---

## File Structure

**Create**

- `src/domain/config/terminal-shortcuts.ts`
  - Normalized keybinding types, defaults, parsing helpers, display formatting, conflict checks.
- `src/domain/config/terminal-shortcuts.test.ts`
  - Unit tests for normalization, formatting, and conflict detection.
- `src/features/terminal/components/PaneHeaderActionCluster.tsx`
  - Right-side grouped split/menu/close controls for pane headers.
- `src/features/config/components/ShortcutRecorder.tsx`
  - Reusable recorder UI for capturing a keyboard shortcut in settings.

**Modify**

- `src/domain/config/types.ts`
  - Add terminal shortcut config types.
- `src/domain/config/model.ts`
  - Normalize new shortcut config and merge with defaults.
- `src/domain/config/model.test.ts`
  - Cover default, invalid, cleared, and duplicate shortcut inputs.
- `src/features/config/state/app-config-store.test.ts`
  - Verify shortcut patches flow through config normalization.
- `src/domain/terminal/shortcuts.ts`
  - Extend workspace shortcut resolution to include config-driven pane actions.
- `src/features/terminal/hooks/useWorkspaceShortcuts.ts`
  - Allow pane action shortcuts to fire even in editable elements and dispatch the new actions.
- `src/features/terminal/components/TerminalWorkspace.tsx`
  - Supply config-driven actions into the workspace shortcut hook.
- `src/features/terminal/state/workspace-store.ts`
  - Add pane-scoped action helpers and note-edit request state for global shortcut triggering.
- `src/features/terminal/state/workspace-store.test.ts`
  - Cover split-active-pane and request-edit-note behaviors.
- `src/features/terminal/components/TerminalPane.tsx`
  - Replace ad hoc right-side buttons with a unified header action cluster and respond to note-edit requests.
- `src/features/terminal/components/PaneActionMenu.tsx`
  - Remove split items from the menu payload.
- `src/features/terminal/lib/pane-actions.ts`
  - Restrict menu actions to low-frequency items.
- `src/features/terminal/lib/pane-actions.test.ts`
  - Update action availability expectations after split action removal.
- `src/features/config/components/SettingsPanel.tsx`
  - Add shortcut configuration section with record/reset/clear controls.
- `src/app/styles.css`
  - Add grouped header-action styles and shortcut settings styles.

## Task 1: Add Normalized Pane Shortcut Config

**Files:**
- Create: `src/domain/config/terminal-shortcuts.ts`
- Test: `src/domain/config/terminal-shortcuts.test.ts`
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Modify: `src/domain/config/model.test.ts`
- Modify: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write the failing shortcut normalization tests**

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TERMINAL_SHORTCUTS,
  formatShortcutBinding,
  normalizeTerminalShortcutConfig,
} from "./terminal-shortcuts";

describe("terminal shortcut config", () => {
  it("provides the approved default pane action bindings", () => {
    expect(DEFAULT_TERMINAL_SHORTCUTS).toEqual({
      splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
      splitDown: { key: "]", ctrl: true, alt: true, shift: false, meta: false },
      editNote: { key: "\\\\", ctrl: true, alt: true, shift: false, meta: false },
    });
  });

  it("falls back to defaults for malformed shortcut objects", () => {
    expect(
      normalizeTerminalShortcutConfig({
        splitRight: { key: "", ctrl: true, alt: true, shift: false, meta: false },
      }),
    ).toEqual(DEFAULT_TERMINAL_SHORTCUTS);
  });

  it("preserves an explicitly cleared binding", () => {
    expect(
      normalizeTerminalShortcutConfig({
        editNote: null,
      }).editNote,
    ).toBeNull();
  });

  it("formats a binding for settings display", () => {
    expect(
      formatShortcutBinding({ key: "]", ctrl: true, alt: true, shift: false, meta: false }),
    ).toBe("Ctrl+Alt+]");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: FAIL because `terminal-shortcuts.ts` does not exist and terminal config has no shortcut fields yet

- [ ] **Step 3: Implement normalized shortcut config helpers**

```ts
export interface ShortcutBinding {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface TerminalShortcutConfig {
  splitRight: ShortcutBinding | null;
  splitDown: ShortcutBinding | null;
  editNote: ShortcutBinding | null;
}

export const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutConfig = {
  splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
  splitDown: { key: "]", ctrl: true, alt: true, shift: false, meta: false },
  editNote: { key: "\\", ctrl: true, alt: true, shift: false, meta: false },
};

export function normalizeTerminalShortcutConfig(
  value: Partial<Record<keyof TerminalShortcutConfig, ShortcutBinding | null>> | undefined,
): TerminalShortcutConfig {
  const normalized: TerminalShortcutConfig = {
    splitRight: normalizeShortcutBinding(value?.splitRight, DEFAULT_TERMINAL_SHORTCUTS.splitRight),
    splitDown: normalizeShortcutBinding(value?.splitDown, DEFAULT_TERMINAL_SHORTCUTS.splitDown),
    editNote: normalizeShortcutBinding(value?.editNote, DEFAULT_TERMINAL_SHORTCUTS.editNote),
  };

  return hasDuplicateShortcutBindings(normalized) ? DEFAULT_TERMINAL_SHORTCUTS : normalized;
}
```

- [ ] **Step 4: Extend terminal config types and model normalization**

```ts
export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  dialogFontFamily: string;
  dialogFontSize: number;
  preferredMode: TerminalPreferredMode;
  themePreset: ThemePresetId;
  shortcuts: TerminalShortcutConfig;
  phrases: string[];
  phraseUsage: Record<string, number>;
}
```

```ts
terminal: {
  defaultShell: normalizeString(terminal?.defaultShell, DEFAULT_APP_CONFIG.terminal.defaultShell),
  defaultCwd: normalizeString(terminal?.defaultCwd, DEFAULT_APP_CONFIG.terminal.defaultCwd),
  dialogFontFamily: normalizeDialogFontFamily(terminal),
  dialogFontSize: normalizeDialogFontSize(terminal),
  preferredMode: normalizePreferredMode(terminal?.preferredMode),
  themePreset: normalizeThemePreset(terminal?.themePreset),
  shortcuts: normalizeTerminalShortcutConfig(terminal?.shortcuts),
  phrases,
  phraseUsage: normalizePhraseUsage(terminal?.phraseUsage, phrases),
},
```

- [ ] **Step 5: Verify the tests pass**

Run: `npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/config/terminal-shortcuts.ts \
  src/domain/config/terminal-shortcuts.test.ts \
  src/domain/config/types.ts \
  src/domain/config/model.ts \
  src/domain/config/model.test.ts \
  src/features/config/state/app-config-store.test.ts
git commit -m "feat: add pane shortcut configuration"
```

## Task 2: Route Global Shortcuts To Pane Actions

**Files:**
- Modify: `src/domain/terminal/shortcuts.ts`
- Modify: `src/features/terminal/hooks/useWorkspaceShortcuts.ts`
- Modify: `src/features/terminal/components/TerminalWorkspace.tsx`
- Modify: `src/features/terminal/state/workspace-store.ts`
- Modify: `src/features/terminal/state/workspace-store.test.ts`

- [ ] **Step 1: Write the failing shortcut resolver and workspace store tests**

```ts
it("resolves configured pane-action shortcuts", () => {
  expect(
    resolveWorkspaceShortcut(
      { key: "[", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false },
      DEFAULT_TERMINAL_SHORTCUTS,
    ),
  ).toEqual({ type: "split-right" });
});

it("requests note editing for the active pane", () => {
  useWorkspaceStore.getState().bootstrapWindow({ shell: "/bin/bash", cwd: "~" });
  useWorkspaceStore.getState().requestEditNoteForActiveTab();

  expect(useWorkspaceStore.getState().noteEditorTabId).toBe("tab:1");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/terminal/state/workspace-store.test.ts src/domain/config/terminal-shortcuts.test.ts`  
Expected: FAIL because workspace shortcut resolution does not accept config and the store has no note-edit request state

- [ ] **Step 3: Extend workspace shortcut resolution with pane actions**

```ts
export type WorkspaceShortcutAction =
  | { type: "focus-pane"; direction: FocusDirection }
  | { type: "split-right" }
  | { type: "split-down" }
  | { type: "edit-note" };

export function resolveWorkspaceShortcut(
  event: TerminalShortcutEvent,
  shortcuts: TerminalShortcutConfig,
): WorkspaceShortcutAction | null {
  const paneAction = resolvePaneActionShortcut(event, shortcuts);
  if (paneAction) {
    return paneAction;
  }

  // existing focus-pane logic remains here
}
```

- [ ] **Step 4: Add active-pane action helpers and note-edit request state to the workspace store**

```ts
interface WorkspaceStore {
  noteEditorTabId: string | null;
  splitActiveTab: (axis: SplitAxis) => void;
  requestEditNoteForActiveTab: () => void;
  clearNoteEditorRequest: (tabId: string) => void;
}
```

```ts
splitActiveTab: (axis) =>
  set((state) => {
    if (!state.window) {
      return state;
    }

    return splitCurrentActiveTab(state, axis);
  }),
```

- [ ] **Step 5: Update the global shortcut hook to always allow pane-action shortcuts**

```ts
const action = resolveWorkspaceShortcut(event, terminalShortcuts);
if (!action) {
  return;
}

if (action.type === "focus-pane" && isEditableTarget(event.target)) {
  return;
}

event.preventDefault();

switch (action.type) {
  case "split-right":
    splitActiveTab("horizontal");
    return;
  case "split-down":
    splitActiveTab("vertical");
    return;
  case "edit-note":
    requestEditNoteForActiveTab();
    return;
  case "focus-pane":
    focusAdjacentTab(action.direction);
}
```

- [ ] **Step 6: Verify the tests pass**

Run: `npm test -- src/features/terminal/state/workspace-store.test.ts src/domain/config/terminal-shortcuts.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/terminal/shortcuts.ts \
  src/features/terminal/hooks/useWorkspaceShortcuts.ts \
  src/features/terminal/components/TerminalWorkspace.tsx \
  src/features/terminal/state/workspace-store.ts \
  src/features/terminal/state/workspace-store.test.ts
git commit -m "feat: wire pane shortcuts to active pane actions"
```

## Task 3: Promote Split Actions Into The Pane Header Cluster

**Files:**
- Create: `src/features/terminal/components/PaneHeaderActionCluster.tsx`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/terminal/components/PaneActionMenu.tsx`
- Modify: `src/features/terminal/lib/pane-actions.ts`
- Modify: `src/features/terminal/lib/pane-actions.test.ts`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing pane action test**

```ts
it("keeps only low-frequency items in the pane menu", () => {
  expect(
    resolvePaneActions({
      canClose: true,
      canSplitHorizontal: true,
      canSplitVertical: true,
    }),
  ).toEqual([
    { id: "edit-note", label: "Edit Note", disabled: false },
    { id: "close-tab", label: "Close Tab", disabled: false },
    { id: "restart-shell", label: "Restart Shell", disabled: false },
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/terminal/lib/pane-actions.test.ts`  
Expected: FAIL because split actions are still part of the menu helper

- [ ] **Step 3: Extract a dedicated right-side header action cluster**

```tsx
export function PaneHeaderActionCluster({
  canSplitRight,
  canSplitDown,
  canClose,
  onSplitRight,
  onSplitDown,
  onOpenMenu,
  onClose,
}: PaneHeaderActionClusterProps) {
  return (
    <div className="pane-header-actions" aria-label="Pane actions">
      <button type="button" aria-label="Split Right" disabled={!canSplitRight} onClick={onSplitRight}>
        →
      </button>
      <button type="button" aria-label="Split Down" disabled={!canSplitDown} onClick={onSplitDown}>
        ↓
      </button>
      <button type="button" aria-label="More pane actions" onClick={onOpenMenu}>
        ...
      </button>
      <button type="button" aria-label="Close tab" disabled={!canClose} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Rework `TerminalPane` to use the grouped control band**

```tsx
<div className="terminal-pane__header-actions">
  <PaneHeaderActionCluster
    canSplitRight={canSplitHorizontal}
    canSplitDown={canSplitVertical}
    canClose={canClose}
    onSplitRight={() => runSplitAction("horizontal")}
    onSplitDown={() => runSplitAction("vertical")}
    onOpenMenu={() => setMenuOpen(true)}
    onClose={(event) => {
      event.stopPropagation();
      void requestClose();
    }}
  />
</div>
```

- [ ] **Step 5: Update menu actions and styles**

```ts
return [
  {
    id: "edit-note",
    label: "Edit Note",
    disabled: false,
  },
  {
    id: "close-tab",
    label: "Close Tab",
    disabled: !canClose,
  },
  {
    id: "restart-shell",
    label: "Restart Shell",
    disabled: false,
  },
];
```

```css
.pane-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border: 1px solid var(--border);
  background: var(--surface);
}

.terminal-pane__title {
  min-width: 0;
  flex: 1 1 auto;
}
```

- [ ] **Step 6: Verify the tests pass**

Run: `npm test -- src/features/terminal/lib/pane-actions.test.ts src/features/terminal/lib/close-policy.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/terminal/components/PaneHeaderActionCluster.tsx \
  src/features/terminal/components/TerminalPane.tsx \
  src/features/terminal/components/PaneActionMenu.tsx \
  src/features/terminal/lib/pane-actions.ts \
  src/features/terminal/lib/pane-actions.test.ts \
  src/app/styles.css
git commit -m "feat: move split actions into pane header cluster"
```

## Task 4: Add Shortcut Editing To Settings

**Files:**
- Create: `src/features/config/components/ShortcutRecorder.tsx`
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/domain/config/terminal-shortcuts.ts`
- Modify: `src/domain/config/terminal-shortcuts.test.ts`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing shortcut conflict test**

```ts
it("detects duplicate pane shortcut bindings", () => {
  expect(
    hasDuplicateShortcutBindings({
      splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
      splitDown: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
      editNote: { key: "\\\\", ctrl: true, alt: true, shift: false, meta: false },
    }),
  ).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/config/terminal-shortcuts.test.ts`  
Expected: FAIL because duplicate detection/display helpers are incomplete

- [ ] **Step 3: Add shortcut conflict helpers and recorder component**

```tsx
export function ShortcutRecorder({
  value,
  onChange,
  onClear,
  onReset,
  error,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);

  return (
    <div className="shortcut-recorder">
      <button type="button" onClick={() => setIsRecording(true)}>
        {isRecording ? "Press keys…" : formatShortcutBinding(value)}
      </button>
      <button type="button" onClick={onReset}>Reset</button>
      <button type="button" onClick={onClear}>Clear</button>
      {error ? <p className="settings-status settings-status--error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Add a `Shortcuts` section to settings**

```tsx
<div className="settings-section__title">
  <strong>Pane Shortcuts</strong>
  <p>These shortcuts stay active whenever the app window is focused.</p>
</div>

<ShortcutRecorder
  value={config.terminal.shortcuts.splitRight}
  onChange={(binding) => updateShortcut("splitRight", binding)}
  onReset={() => resetShortcut("splitRight")}
  onClear={() => clearShortcut("splitRight")}
  error={shortcutErrors.splitRight}
/>
```

- [ ] **Step 5: Verify the tests pass**

Run: `npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/config/components/ShortcutRecorder.tsx \
  src/features/config/components/SettingsPanel.tsx \
  src/domain/config/terminal-shortcuts.ts \
  src/domain/config/terminal-shortcuts.test.ts \
  src/app/styles.css
git commit -m "feat: add configurable pane shortcuts in settings"
```

## Task 5: Connect Edit Note Requests To The Pane UI And Verify End To End

**Files:**
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/terminal/state/workspace-store.ts`
- Modify: `src/features/terminal/state/workspace-store.test.ts`
- Modify: `src/features/terminal/hooks/useWorkspaceShortcuts.ts`

- [ ] **Step 1: Write the failing store test for request clearing**

```ts
it("clears note edit requests after the pane consumes them", () => {
  useWorkspaceStore.getState().bootstrapWindow({ shell: "/bin/bash", cwd: "~" });
  useWorkspaceStore.getState().requestEditNoteForActiveTab();
  useWorkspaceStore.getState().clearNoteEditorRequest("tab:1");

  expect(useWorkspaceStore.getState().noteEditorTabId).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/terminal/state/workspace-store.test.ts`  
Expected: FAIL because the request-clearing workflow is not yet complete

- [ ] **Step 3: Make `TerminalPane` react to note edit requests**

```tsx
useEffect(() => {
  if (noteEditorTabId !== tabId) {
    return;
  }

  setNoteDraft(tab.note ?? "");
  setIsEditingNote(true);
  clearNoteEditorRequest(tabId);
}, [clearNoteEditorRequest, noteEditorTabId, tab.note, tabId]);
```

- [ ] **Step 4: Verify targeted tests, then full project verification**

Run: `npm test -- src/features/terminal/state/workspace-store.test.ts src/features/terminal/lib/pane-actions.test.ts src/domain/config/terminal-shortcuts.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: PASS

Run: `npm test`  
Expected: PASS

Run: `npm run typecheck`  
Expected: PASS

Run: `npm run build`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/TerminalPane.tsx \
  src/features/terminal/state/workspace-store.ts \
  src/features/terminal/state/workspace-store.test.ts \
  src/features/terminal/hooks/useWorkspaceShortcuts.ts
git commit -m "feat: trigger pane note editing from global shortcuts"
```

## Self-Review

Spec coverage check:

- Header split buttons promoted to first-class actions: covered in Task 3.
- Elegant grouped right-side action band: covered in Task 3 styles/component split.
- Configurable defaults and persistence: covered in Task 1 and Task 4.
- Always-on app-window shortcut behavior: covered in Task 2.
- Conflict rejection and reset/clear affordances: covered in Task 1 and Task 4.
- `Edit Note` remains the existing note action rather than a rename flow: covered in Task 2 and Task 5.

Placeholder scan:

- No `TODO`, `TBD`, or cross-task “similar to above” placeholders remain.
- Each task includes explicit files, tests, and commands.

Type consistency:

- Shortcut config shape is consistently `TerminalShortcutConfig`.
- Shortcut actions are consistently `split-right`, `split-down`, and `edit-note`.
- Note-edit request state is consistently `noteEditorTabId`.
