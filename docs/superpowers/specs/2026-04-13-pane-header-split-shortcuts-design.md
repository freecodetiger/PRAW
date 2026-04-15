# Pane Header Split Actions And Shortcut Customization Design

## Goal

Promote pane splitting into first-class header actions and make the associated shortcuts user-configurable without weakening the current pane-focused interaction model.

This change covers four user-facing outcomes:

- Show `Split Right` and `Split Down` directly in the pane header instead of hiding them under `...`.
- Organize the header actions as an elegant right-side control cluster rather than a row of unrelated buttons.
- Let users customize shortcuts for `Split Right`, `Split Down`, and `Edit Note`.
- Keep those shortcuts active whenever the app window is focused and an active pane exists, even if focus is currently inside terminal input or another text field.

## Product Decisions

### Pane Header Layout

The pane header becomes a three-part structure:

- left: title and note display
- middle: mode/status badges such as `AI MODE`
- right: a unified action cluster

The right-side action cluster is the new primary affordance for pane operations. It contains:

- `Split Right`
- `Split Down`
- `...`
- `×`

These controls are visually grouped into a single action band so the header reads as one intentional tool area instead of separate loose buttons.

### Title Compression Rule

When pane width becomes constrained, the title is the only element allowed to compress.

Rules:

- the right-side action cluster must remain visible
- the status badge should remain visible when present
- the title truncates with ellipsis as needed
- split actions do not collapse back into `...`

This is an explicit product choice: header action availability is more important than preserving long title readability in narrow panes.

### Menu Ownership

The `...` menu remains the home for low-frequency actions only.

After this change, `...` keeps:

- `Edit Note`
- `Restart Shell`
- optionally `Close Tab` as a duplicate path for users who prefer menu navigation

After this change, `...` no longer includes:

- `Split Right`
- `Split Down`

### Shortcut Defaults

The default shortcut set is:

- `Ctrl+Alt+[` → `Split Right`
- `Ctrl+Alt+]` → `Split Down`
- `Ctrl+Alt+\` → `Edit Note`

These defaults are treated as workspace-level defaults and may be replaced by user configuration.

### Shortcut Scope

The new pane-action shortcuts are intentionally global within the app window.

They fire when:

- the application window is focused
- an active pane exists

They do not stop working because focus is inside:

- dialog composer input
- classic xterm surface
- live command console
- note editor input
- settings fields

This is a deliberate tradeoff in favor of immediate pane control. The shortcut system should therefore prioritize predictability and strong conflict handling over permissive overlapping behavior.

### Shortcut Conflict Policy

Conflicting shortcuts are not allowed to save.

Rules:

- if a new shortcut duplicates another pane-action shortcut, saving is blocked
- the UI must show which action currently owns that shortcut
- users can reset any action to its default binding
- users can clear a binding entirely if they do not want that action bound

## Architecture

### Configuration Model

Extend terminal configuration with pane-action shortcut settings rather than hardcoding pane actions in the shortcut resolver.

Suggested shape:

- `terminal.shortcuts.splitRight`
- `terminal.shortcuts.splitDown`
- `terminal.shortcuts.editNote`

Each stored shortcut should normalize into a structured keybinding shape instead of raw display text. A normalized binding should at minimum encode:

- key
- ctrl
- alt
- shift
- meta

This keeps matching logic deterministic and avoids reparsing display strings throughout the app.

### Shortcut Resolution

The current workspace shortcut resolver only understands hardcoded directional focus commands. That logic should be extended into a configuration-aware resolver with two responsibility layers:

- built-in workspace navigation shortcuts
- configurable pane action shortcuts

The pane action bindings should resolve into explicit actions such as:

- `split-right`
- `split-down`
- `edit-note`

Resolution order must be deterministic. If a binding matches a configured pane action, the resolver returns that action and prevents default browser behavior.

### Validation And Normalization

Configuration loading must sanitize shortcut data the same way existing config fields are normalized.

Normalization requirements:

- malformed shortcut objects fall back to defaults
- duplicate shortcut definitions are rejected in settings before save
- empty bindings are allowed only when explicitly cleared
- imported legacy config without pane-action shortcuts falls back to defaults

### Pane Header Composition

The current header implementation should be restructured into smaller presentational units:

- title region
- status region
- action cluster

The action cluster is a dedicated component boundary responsible for:

- rendering split buttons
- rendering the `...` trigger
- preserving consistent spacing, dimensions, and hover states

This keeps the growing header logic from collapsing into one large component file.

## Component Design

### Right-Side Control Cluster

The right-side control cluster should feel like a compact toolbar.

Visual rules:

- all controls share a common height
- spacing is tight and consistent
- icon-first rendering is preferred for split actions
- hover and active states use the same visual language across split buttons, `...`, and close
- the cluster reads as one coherent band rather than four unrelated hit targets

The split buttons should look lighter than destructive actions. `×` remains visually secondary until hover, so splitting stays discoverable without making the header feel aggressive.

### Split Button Presentation

The split actions should use concise directional affordances instead of full text labels inside the header.

Preferred direction:

- right split button: rightward affordance
- down split button: downward affordance

Accessible labels still use the full names:

- `Split Right`
- `Split Down`

### Settings Panel Shortcut Editor

Shortcut customization belongs in the global `Settings` panel, not inside a pane-local menu.

The settings UI should provide one row per action:

- action label
- current shortcut display
- record/change control
- reset control
- clear control

The shortcut editor should use capture/record interaction rather than freeform text entry. The user activates recording, presses a key combination, and the UI stores the normalized result if it is valid and non-conflicting.

### Edit Note Triggering

`Edit Note` remains conceptually the existing note-edit action. The shortcut should trigger the same editing flow as the `...` menu item and double-click behavior.

No separate rename concept is introduced. The shortcut opens note editing for the current active pane only.

## Data Flow

### Split Action Click

1. User clicks `Split Right` or `Split Down` in the header action cluster.
2. The header dispatches the corresponding pane action for the current pane.
3. Workspace layout store applies the split exactly as current menu-driven splitting does.
4. The new pane inherits existing creation/default behaviors.

### Shortcut Trigger

1. User presses a configured keybinding while the app window is focused.
2. Global workspace shortcut listener resolves the binding against normalized configuration.
3. If a pane-action shortcut matches, default browser behavior is prevented.
4. The action dispatches against the current active pane.
5. Resulting UI flow matches the corresponding click path.

### Shortcut Editing

1. User opens `Settings`.
2. User starts recording on a shortcut row.
3. UI captures the next key combination and normalizes it.
4. Conflict validation runs before saving.
5. On success, config store persists the new binding.
6. Global shortcut resolution uses the updated config immediately.

## Error Handling And Validation

### No Active Pane

If a pane-action shortcut fires without an active pane, it should safely no-op.

This should not throw, focus-jump unexpectedly, or alter unrelated layout state.

### Invalid Or Incomplete Captures

The shortcut editor should reject unusable captures such as:

- modifier-only input
- composition/dead/process keys
- bindings the app cannot normalize reliably

Invalid captures should leave the previous shortcut untouched and show a short validation message.

### Conflicts

If the user attempts to save a conflicting binding:

- the new value is not applied
- the existing binding remains unchanged
- the UI explicitly identifies the conflicting action

### Always-On Triggering

Because pane-action shortcuts stay active inside text inputs and terminals, they can override combinations that would otherwise insert characters or control shell behavior.

This is intentional. The implementation should not attempt context-sensitive opt-outs, because that would contradict the product requirement for always-on pane control.

## Testing Strategy

### Domain And Config Tests

- config normalization fills missing pane-action shortcuts with defaults
- invalid shortcut objects fall back safely
- cleared bindings round-trip correctly
- duplicate bindings are rejected

### Shortcut Resolver Tests

- default bindings resolve to `split-right`, `split-down`, and `edit-note`
- custom bindings override defaults
- unsupported key events return `null`
- pane-action shortcuts still resolve while focus is inside editable controls because the global listener intentionally allows them through

### Component And Store Tests

- header renders split buttons in the right-side control cluster
- title truncation does not hide the action cluster
- `...` menu no longer lists split actions
- split button click dispatches existing split behavior
- `Edit Note` shortcut opens note editing for the active pane

### Regression Checks

- existing pane close behavior still works
- existing `AI MODE` badge presentation remains intact
- existing pane focus navigation shortcuts remain intact
- dialog and classic terminal rendering are unaffected by the new header layout

## Implementation Boundaries

This spec intentionally does not include:

- configurable shortcuts for every pane action
- OS-level global shortcuts outside the app window
- draggable header customization or reorderable action buttons
- icon theme selection for header controls
- tab-strip level split controls

The scope is intentionally limited to promoting split actions into the pane header and making three pane actions configurable in a reliable, pane-focused way.
