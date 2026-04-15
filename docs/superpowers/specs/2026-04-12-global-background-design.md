# Global Background Customization Design

**Date:** 2026-04-12

## Goal

Add a single global background customization feature for the terminal workspace so the user can choose a local image through a system picker, apply it to all terminal panes, and adjust transparency while keeping the image fully visible with its original aspect ratio.

## Scope

This design intentionally supports only one global background shared by all terminal tabs and split panes.

Included:
- Select a local image through a native file picker
- Import the selected image into app-managed storage
- Apply the image to every terminal pane globally
- Preserve original aspect ratio and show the full image
- Use the active theme color as the letterbox background
- Adjust image opacity globally
- Remove the configured background and fall back to theme-only rendering
- Persist the background configuration across restarts

Explicitly excluded:
- Per-tab or per-pane background overrides
- Background galleries or multiple saved presets
- Advanced positioning modes
- Cover/crop/stretch modes
- Arbitrary user-entered file paths

## Why This Shape

The current app already keeps terminal appearance decisions in global configuration and keeps pane runtime state separate from workspace layout and process state. A global background belongs to the same appearance layer as theme preset and font size, not to pane state.

This separation keeps the feature maintainable:
- Configuration owns declarative appearance state
- Rust owns file import and cleanup
- React renders a background layer from normalized config
- Terminal runtime remains unaware of image file management

## Architecture

### 1. Configuration Layer

Extend `terminal` configuration with a single background object:

- `backgroundEnabled: boolean`
- `backgroundImagePath: string`
- `backgroundImageName: string`
- `backgroundOpacity: number`

Responsibilities:
- represent the current global background state
- normalize invalid values
- persist and restore the state through the existing config pipeline

Normalization rules:
- `backgroundEnabled` defaults to `false`
- `backgroundImagePath` defaults to empty string
- `backgroundImageName` defaults to empty string
- `backgroundOpacity` defaults to a safe visual midpoint and is clamped into `[0, 1]`
- a config with an empty image path cannot be considered active even if `backgroundEnabled` is true

### 2. Background Asset Management Layer

Add a Rust-side background asset workflow instead of rendering directly from the original user path.

Flow:
1. Frontend requests image selection
2. Rust opens a native file picker filtered to image types
3. Rust validates the selected file extension and source path
4. Rust copies the selected file into app-managed storage such as `<app_data_dir>/backgrounds/current.<ext>`
5. Rust removes the previous managed background file after the new file is safely in place
6. Rust returns the managed file path and display name to the frontend

Responsibilities:
- own file picker interaction
- validate allowed image types
- create the backgrounds directory if missing
- replace old managed files atomically enough to avoid visible blank states
- clear managed assets when the user removes the background

Recommended supported image types:
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

### 3. Tauri Bridge Layer

Expose small, focused commands instead of broad file APIs.

Commands:
- `select_terminal_background_image` -> opens picker, imports asset, returns `{ path, name }` or cancel result
- `clear_terminal_background_image` -> deletes managed background asset if present

The frontend should not know app data directory details. It should only receive a resolved managed path suitable for rendering and persistence.

### 4. UI Rendering Layer

Apply the background at the pane container level, not inside terminal text rendering.

Render model for each `terminal-pane`:
- base pane background remains the active theme surface color
- an absolutely positioned background image layer sits behind the pane content
- pane content, xterm canvas, dialog history, composer, and overlays remain above it
- image styling is fixed:
  - `background-size: contain`
  - `background-position: center`
  - `background-repeat: no-repeat`

Opacity handling:
- opacity applies only to the image layer
- pane content opacity never changes
- the active theme background remains visible in the unused areas caused by `contain`

This avoids coupling image behavior to xterm internals and avoids degrading text legibility through whole-pane transparency.

## Settings UX

Add a new `Background` section to the settings panel.

Controls:
- `Choose image` button
- `Remove background` button
- `Opacity` range control
- short status line showing whether a background is configured and the imported filename

Behavior:
- choosing an image immediately imports and applies it globally
- removing the image clears config and deletes the managed background asset
- changing opacity applies immediately to all panes
- picker cancel is silent and should not show an error
- import errors show a short inline status message in settings

Recommended copy:
- summary: `Global terminal background shared by all tabs and splits.`
- empty state: `No background image selected.`
- configured state: `Using <filename>`

## Data Flow

### Select image

1. User opens settings and clicks `Choose image`
2. Frontend calls the Tauri command
3. Rust opens native file picker
4. User selects an image or cancels
5. On success, Rust imports the file into managed storage and returns metadata
6. Frontend patches terminal config with the returned path and name, sets `backgroundEnabled = true`
7. All visible panes rerender using the new background layer
8. Config persistence stores the background state

### Remove image

1. User clicks `Remove background`
2. Frontend calls the clear command
3. Rust deletes the managed asset if it exists
4. Frontend clears background config and disables the feature
5. Panes rerender with theme-only backgrounds

### Startup restore

1. App restores persisted config
2. Pane rendering checks whether background is enabled and has a non-empty managed path
3. If path is missing or unreadable, rendering falls back to theme-only display
4. Settings can show a non-fatal unavailable state if desired

## Error Handling

### User cancels picker
- treat as no-op
- do not mutate config
- do not show error state

### Unsupported file type
- reject in Rust before import
- return a concise error string for inline settings feedback

### Import failure
- keep previous background config unchanged
- show inline error in settings

### Managed file missing later
- do not crash or block pane rendering
- silently fall back to theme color in pane rendering
- optionally show `background unavailable` in settings summary

### Replace existing image
- write the new managed file first
- update config second
- remove obsolete managed files last

## Testing Strategy

Follow TDD and add behavior tests before implementation.

### Frontend tests

1. Config model tests
- default background state is disabled and empty
- opacity is clamped into valid range
- enabled background without a path is normalized back to disabled or inert rendering state

2. App config store tests
- patching terminal config accepts background fields
- clearing background removes image path and display name
- persisted hydration preserves valid background state

3. Settings panel tests
- empty state renders without filename
- successful selection updates visible summary
- remove action clears the state
- opacity updates immediately

4. Pane presentation tests
- pane style includes background CSS variables only when enabled with a valid path
- pane style falls back to theme-only background when disabled or missing path

### Rust tests

1. Config tests
- default config includes empty background fields and default opacity
- serialization/deserialization covers the background fields

2. Background import tests
- accepts supported extensions
- rejects unsupported extensions
- replacing a background removes prior managed file
- clearing background deletes managed asset idempotently

## File Responsibilities

Likely files to modify:
- `src/domain/config/types.ts`
  - extend terminal config type with background fields
- `src/domain/config/model.ts`
  - add defaults and normalization logic
- `src/domain/config/model.test.ts`
  - add normalization coverage
- `src/features/config/state/app-config-store.test.ts`
  - verify store updates and persistence semantics
- `src/features/config/components/SettingsPanel.tsx`
  - add background controls and inline status
- `src/features/terminal/components/TerminalPane.tsx`
  - inject background-related CSS variables or classes
- `src/app/styles.css`
  - add background layer styles for terminal panes
- `src/lib/tauri/*`
  - add small bridge helpers for select/clear commands
- `src-tauri/src/config/mod.rs`
  - extend Rust config schema and defaults
- `src-tauri/src/*`
  - add background asset import and clear commands

New tests may also be needed near the Tauri bridge and pane presentation utilities if those abstractions exist or are introduced during implementation.

## Design Constraints

- Background feature remains global only
- Theme background remains the fallback canvas color
- Image must remain fully visible at all times
- Image aspect ratio must remain unchanged
- Text readability takes priority over image presence
- Pane runtime logic must stay decoupled from file import mechanics

## Open Implementation Decisions Already Resolved

- Scope: global only
- Selection method: native file picker
- Letterbox color: active theme color
- Rendering mode: `contain`
- Persistence model: managed imported asset, not raw source path

## Result

This design adds a highly customizable but tightly scoped background system without contaminating terminal runtime logic, workspace layout logic, or pane-local state. The result is flexible for the user and still structurally simple for the codebase.
