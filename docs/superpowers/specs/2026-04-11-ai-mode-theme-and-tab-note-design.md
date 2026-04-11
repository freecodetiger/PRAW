# AI Mode Theme And Tab Note Design

## Goal

Refine pane identity and AI workflow presentation without weakening the current split layout model.

This change covers four user-facing outcomes:

- Keep system pane numbering stable and non-editable.
- Allow each pane to carry a user note that clarifies purpose.
- Remove the visually heavy split divider bar while preserving clear pane boundaries.
- Let users customize AI mode with a theme color and background color from settings.

## Product Decisions

### Stable Pane Identity

Each pane keeps a system-generated base label such as `Tab 1`, `Tab 2`, and so on. This base label is not editable by the user and remains the primary stable identity for layout operations, debugging, and persistence.

The user can optionally attach a note. The visible title is derived:

- No note: `Tab 1`
- With note: `Tab 1 · Build`

The separator is always ` · ` for consistency and compactness.

### Pane Note Instead Of Free Rename

The current free-form `title` behavior is replaced by a structured model:

- `baseTitle`: system-managed label, immutable in normal UI flows
- `note`: user-managed optional annotation

The UI never exposes editing for `baseTitle`. All editing affordances target `note`.

### AI Mode Visual Strategy

AI mode remains visually distinct, but removes noisy texture. The preferred direction is a bright workspace with a strong left rail and explicit badge, driven by configurable colors.

AI mode surfaces:

- left accent rail
- header bottom border
- `AI MODE` badge
- optional subtle AI-mode background fill

These surfaces derive from config values instead of hardcoded one-off colors.

### Scope Of Theme Customization

Settings expose only two user-editable AI mode values:

- `themeColor`
- `backgroundColor`

Other AI mode colors are computed from these values in CSS usage or lightweight helper logic. This avoids a full theming system while still giving users meaningful control.

## Architecture

### Domain Model

Add note support to tab persistence and runtime types.

`TabModel` becomes:

- `tabId`
- `title`
- `note?: string`
- runtime terminal/session fields

`title` continues to represent the stable system label. It is no longer treated as the user-editable display string.

Snapshot and restore logic round-trip `note` as an optional field. Missing legacy values normalize to `undefined`.

### Workspace Store

Replace `renameTab(tabId, title)` with `setTabNote(tabId, note)`.

Responsibilities:

- trim whitespace
- store `undefined` when note becomes empty
- avoid updates when normalized value is unchanged

This keeps note editing isolated from layout and terminal session state.

### Presentation Layer

Introduce a small display helper at the pane boundary:

- `formatTabLabel(title, note) => string`

This helper is used by pane headers, aria labels, context menus, and any future tab list to ensure one formatting rule everywhere.

### Configuration Model

Extend `AiConfig` with:

- `themeColor`
- `backgroundColor`

Defaults should remain visually restrained but more intentional than the current gray treatment. Example default direction:

- `themeColor: #1f5eff`
- `backgroundColor: #eef4ff`

Normalization rules:

- empty string falls back to default
- invalid values fall back to default
- accepted formats can initially be constrained to hex color strings for simplicity

## Component Design

### Pane Header

Header text becomes read-only system label plus note. Example:

- `Tab 3 · Codex Refactor`

Editing behavior changes:

- double-click edits note only
- context menu action becomes `Edit Note`
- inline input placeholder is `Add note`
- blur or Enter commits
- Escape cancels

If the note is empty after normalization, the pane reverts to displaying only `Tab N`.

### Split Boundaries

Remove the current visible divider bar between branches.

The layout still supports resizing, but the visual treatment changes:

- no separate white bar block between panes
- adjacent panes touch directly
- distinction relies on each pane border and active/AI accent states
- resize hit area can remain larger than the visible line if needed

This preserves usability while reducing visual clutter.

### AI Mode Styling

AI mode removes diagonal stripe fills.

Preferred visual system:

- strong left rail using `themeColor`
- `AI MODE` badge using `themeColor`
- subtle pane/header tint using `backgroundColor`
- no decorative pattern fills

The result should feel intentional and colorful without reducing terminal readability.

### Settings Panel

Add an AI mode appearance subsection with:

- theme color input
- background color input
- optional preset buttons for quick starting values

Users can still type custom values directly. Presets are convenience only.

## Data Flow

### Note Editing

1. User double-clicks pane header or selects `Edit Note`.
2. Pane component edits local draft state.
3. Commit calls `setTabNote(tabId, note)`.
4. Workspace store normalizes and stores `note`.
5. Persisted snapshot includes the note.
6. UI recomputes visible label via `formatTabLabel`.

### AI Theme Editing

1. User changes AI theme color or background color in settings.
2. Config store normalizes values through `resolveAppConfig`.
3. Pane and AI-mode styles consume config-derived CSS variables or props.
4. Active AI panes update without restarting sessions.

## Error Handling And Validation

### Notes

- blank notes normalize to `undefined`
- excessively long notes should be capped in UI input
- note content is plain text only

### Colors

- invalid color strings fall back to configured defaults
- settings UI should avoid storing malformed values if color inputs are available
- manual text entry still re-normalizes on store update

### Legacy Data

- old snapshots without `note`, `themeColor`, or `backgroundColor` continue to load
- missing values fall back to defaults

## Testing Strategy

### Domain And Store Tests

- `setTabNote` trims input
- empty note clears persisted note
- note round-trips through window snapshot and restore
- config normalization accepts valid custom colors and rejects invalid ones

### Component-Level Behavioral Tests

- pane header renders `Tab N · Note` when note exists
- pane header renders only `Tab N` when note is absent
- note editor commits on Enter and blur
- note editor cancels on Escape

### Regression Checks

- AI workflow commands still switch dialog panes into classic mode
- AI mode still restores default presentation on exit
- split layout reorder, focus, close, and resize behaviors remain unchanged

## Implementation Boundaries

This spec intentionally does not include:

- full global app theming
- multiple named custom theme profiles
- per-pane custom colors
- editable system numbering

Those can be layered later without reworking the pane identity model introduced here.
