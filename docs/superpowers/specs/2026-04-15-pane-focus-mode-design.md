# Pane Focus Mode Design

Date: 2026-04-15

## Goal

Provide a high-confidence pane focus mode for crowded multi-pane workspaces so the user can temporarily expand the current pane into a true single-pane layout, then exit and recover the exact pre-focus workspace layout.

This is not a cosmetic fullscreen overlay. Focus mode must:

- truly replace the workspace layout with a single active pane
- preserve the original layout as a reversible snapshot
- restore the exact original split structure on exit
- block layout-mutating actions while focus mode is active

## Problem

When the workspace contains many panes, the current pane can become too small to use comfortably. The user needs a fast way to isolate the current pane without permanently destroying the surrounding layout.

The current codebase already supports:

- arbitrary split layouts through the workspace layout tree
- pane switching through workspace shortcuts
- pane-level actions through the header action cluster

What it does not support is a reversible “zoom into this pane” workflow with strong guarantees. A weak visual overlay would not be enough because it would leave the underlying layout active and force special-case behavior across drag, split, resize, and focus logic.

## Product Decision

Add a workspace-level focus mode with these semantics:

- entering focus mode on the active pane stores the current layout and active tab as a reversible snapshot
- the live workspace layout is then replaced with a single-pane layout containing only the focused pane
- exiting focus mode restores the original layout snapshot and the original active tab
- while focus mode is active, layout-mutating actions are disabled

This creates an explicit temporary mode rather than a pile of pane-local hacks.

## User Experience

### Entry Points

Focus mode should be reachable through both:

- a dedicated workspace shortcut
- a pane header entry

The pane header entry should change label based on state:

- normal mode: `Focus Pane`
- focus mode for the focused pane: `Exit Focus`

The shortcut should be a toggle, not two separate commands.

### Exit Behavior

Exit must be lossless with respect to the workspace layout:

- the full split tree returns
- divider ratios return
- the active tab returns to the tab that was active before focus mode began

This is intentional. Exiting focus mode is a restore operation, not a best-effort rehydration.

### Focus Mode Visual Feedback

The UI should make focus mode obvious without becoming loud:

- the focused pane header shows a compact focus-state label
- the workspace root can add a lightweight focused-mode class for chrome adjustments
- the pane header action label flips from enter to exit

No modal or blocking overlay is needed.

## Non-Goals

- Simulating fullscreen with pure CSS while preserving the original multi-pane DOM
- Allowing focus mode to become a second independent layout editing mode
- Persisting focus mode across app restart or workspace restore
- Merging focus-mode-time layout changes back into the pre-focus layout

## Architecture

### 1. Workspace-Level State Ownership

[workspace-store.ts](/home/zpc/projects/praw/src/features/terminal/state/workspace-store.ts) should own focus mode state because the feature changes workspace topology, not just pane visuals.

Add a focused-mode state object with the minimum reversible information:

- `focusedTabId: string | null`
- `layoutBeforeFocus: LayoutNode | null`
- `activeTabIdBeforeFocus: string | null`

This should be derived and managed centrally rather than duplicated across pane components.

### 2. Enter/Exit Actions

Add explicit store actions:

- `enterFocusMode(tabId: string)`
- `exitFocusMode()`
- `toggleFocusMode(tabId: string)`

Behavior:

- `enterFocusMode(tabId)` stores the current layout snapshot and current active tab, then replaces `window.layout` with `createLeafLayout(tabId)` and sets `window.activeTabId` to `tabId`
- `exitFocusMode()` restores `layoutBeforeFocus` and `activeTabIdBeforeFocus`
- `toggleFocusMode(tabId)` enters if unfocused, exits if already focused on that tab

If focus mode is already active and the same pane triggers toggle, the store exits focus mode. If another pane somehow requests entry while focused, the store should ignore the request rather than trying to nest focus sessions.

### 3. Rendering Boundary

[TerminalWorkspace.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalWorkspace.tsx) should read focus state and expose it as a workspace-level CSS state only.

It should not reconstruct layout snapshots or own focus transition logic. Its job is only:

- render the current layout from store state
- add a workspace class for focus-mode visuals
- pass through the current frame normally

The layout swap itself remains entirely store-driven.

### 4. Pane-Level Integration

[TerminalPane.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx) should:

- read whether the current tab is focused
- expose `Focus Pane` or `Exit Focus` in pane actions
- show lightweight header feedback when focused

The pane must not own snapshot logic. It only dispatches focus-mode actions to the store.

### 5. Action Resolution

[pane-actions.ts](/home/zpc/projects/praw/src/features/terminal/lib/pane-actions.ts) should gain a focus action:

- `focus-pane`

Its label and disabled state should be derived from store-driven inputs rather than hardcoded assumptions.

The action model should support:

- normal mode: focus action enabled
- focus mode on this pane: exit-focus label enabled
- focus mode on any pane: layout-mutating actions disabled

### 6. Shortcut Integration

[shortcuts.ts](/home/zpc/projects/praw/src/domain/terminal/shortcuts.ts) and [useWorkspaceShortcuts.ts](/home/zpc/projects/praw/src/features/terminal/hooks/useWorkspaceShortcuts.ts) should add a new workspace action:

- `toggle-focus-pane`

This should route through the same store toggle action used by the pane header entry. There should be one behavior path, not separate logic for keyboard and header UI.

## Focus Mode Guardrails

While focus mode is active, the following operations must be blocked:

- split right
- split down
- close tab
- pane drag and drop
- divider resize
- adjacent pane focus navigation

These operations should be blocked at the state/action layer, not merely hidden in the UI. UI affordances should also reflect the disabled state, but the store must remain the final guardrail.

The following operations remain allowed:

- terminal and AI interaction inside the focused pane
- note editing
- shell restart
- transcript interaction, copy/paste, selection, prompt submission

## Data Integrity Rules

### Snapshot Fidelity

The snapshot taken on entry must be the exact `window.layout` object graph at the moment focus begins, paired with the exact `window.activeTabId`.

Restoration must use that stored snapshot directly. The implementation should not attempt to rebuild the old layout from pane lists or infer divider structure.

### Persistence

Focus mode should not be persisted into workspace restore snapshots in the first implementation.

Reason:

- focus mode is a temporary productivity state, not a stable workspace topology
- restoring into focused mode after app restart would feel like panes disappeared
- leaving persistence out keeps the model simpler and safer

If the app closes mid-focus, the next launch should restore the last non-focus workspace layout.

## Error and Edge Handling

### Single-Pane Workspace

If the workspace already contains a single pane, entering focus mode is still allowed for consistency. The visible effect may be minimal, but the UI should still allow toggling back out cleanly.

### Missing Tab During Focus

If the focused tab becomes unavailable unexpectedly, the store should exit focus mode and attempt to restore the snapshot. If snapshot restoration is not possible, the store should fall back to a safe single-pane layout using the current active tab.

This path is a defensive fallback, not the normal flow.

### Repeated Entry Attempts

If focus mode is already active, repeated enter requests should not overwrite the original snapshot. The first snapshot remains authoritative until exit.

## Testing

### Workspace Store Tests

Add store tests covering:

- entering focus mode stores the previous layout and active tab
- entering focus mode replaces the layout with `createLeafLayout(focusedTabId)`
- exiting focus mode restores the exact previous layout
- exiting focus mode restores the previous active tab
- repeated enter requests do not overwrite the original snapshot
- focus mode blocks split, close, drag-preview apply, resize, and adjacent-focus actions

### Shortcut Tests

Add shortcut tests covering:

- the configured focus shortcut resolves to `toggle-focus-pane`
- focus toggle works from the workspace shortcut hook
- blocked navigation shortcuts do nothing while focus mode is active

### Pane Action Tests

Add pane action tests covering:

- normal mode shows `Focus Pane`
- focused pane shows `Exit Focus`
- close and split actions are disabled while focus mode is active

### UI Tests

Add UI tests around [TerminalWorkspace.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalWorkspace.tsx) and [TerminalPane.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx):

- entering focus mode renders only the active pane
- exiting focus mode restores the original pane count and structure
- header affordance flips correctly between enter and exit
- focus mode visual state is present on the workspace root

## Risks

- If focus mode is implemented as a render-only overlay, drag, resize, and action semantics will remain tied to the hidden layout and become inconsistent.
- If layout-mutating actions are only hidden in the UI but not blocked in the store, shortcuts and indirect actions will corrupt the reversibility guarantee.
- If exit rebuilds layout heuristically instead of restoring a stored snapshot, divider ratios and tree shape will drift and break trust.

## Recommendation

Implement focus mode as a first-class workspace state with a reversible layout snapshot:

- snapshot and restore in `workspace-store`
- render current layout normally through `TerminalWorkspace`
- expose a unified toggle through pane actions and workspace shortcuts
- hard-block layout mutation while focused

That is the highest-confidence path to the behavior you asked for: true pane focus, exact restoration, and long-term maintainability.
