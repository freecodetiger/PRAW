# Classic And Dialog Font Strategy Design

## Summary

This design fixes classic mode font instability by removing font-family customization from classic mode entirely and standardizing both terminal modes on a bundled default font: `CaskaydiaCove Nerd Font Mono`.

Classic remains a real `xterm`-backed terminal and always renders with the bundled font. Dialog keeps its existing configurable text rendering model, but its configurable font controls apply only to dialog mode.

## Problem

Classic mode currently renders through `xterm`, while dialog mode renders as regular DOM text. This creates different font compatibility characteristics:

- Classic depends on fixed terminal cell measurement and is sensitive to fonts whose glyph metrics do not behave well in `xterm`.
- Dialog is much more tolerant because it uses normal browser text layout.
- The current configuration model shares one terminal font setting across both modes, so changing the font for dialog can unintentionally degrade classic readability.

The concrete issue reported is that `JetBrains Mono` shows uneven spacing in classic mode, while `CaskaydiaCove Nerd Font Mono` renders cleanly and consistently.

## Goals

- Eliminate classic mode font compatibility regressions caused by user-selected fonts.
- Keep classic mode as a true interactive terminal with `xterm` semantics.
- Make `CaskaydiaCove Nerd Font Mono` the default font for both modes.
- Preserve dialog mode font customization.
- Split font settings so dialog font changes never affect classic mode.

## Non-Goals

- Supporting arbitrary user-selected fonts in classic mode.
- Adding a classic font override or compatibility toggle.
- Replacing classic mode with dialog-style rendering.
- Implementing runtime font probing or font-specific workaround logic.

## Product Decisions

### 1. Classic Font Policy

Classic mode always uses the bundled `CaskaydiaCove Nerd Font Mono` font and does not expose a user-editable font-family setting.

This is a deliberate product constraint. Classic is optimized for terminal stability, not font freedom.

### 2. Dialog Font Policy

Dialog mode also defaults to `CaskaydiaCove Nerd Font Mono`, but users can still change its font family and font size in settings.

These dialog font settings do not influence classic mode.

### 3. Bundled Font Distribution

`CaskaydiaCove Nerd Font Mono` is packaged with the application so the default font does not depend on system installation state.

The app must register the bundled font before classic mode creates its `xterm` instance.

## Architecture

### Runtime Font Sources

- Classic font family: fixed runtime constant pointing to bundled `CaskaydiaCove Nerd Font Mono`.
- Dialog font family: persisted user configuration with default `CaskaydiaCove Nerd Font Mono`.
- Dialog font size: persisted user configuration.

Classic does not read persisted font-family settings.

### Rendering Boundaries

- `ClassicTerminalSurface` receives the bundled classic font family regardless of settings state.
- `DialogTerminalSurface` continues to render with the configurable dialog font settings.
- `TerminalPane` becomes the boundary that routes mode-specific font values to each renderer.

### Startup Sequence

1. Load and register the bundled `CaskaydiaCove Nerd Font Mono` font during app startup.
2. Only then allow classic `xterm` surfaces to initialize.
3. If font registration fails, continue with the same family name and monospace fallback as a defensive path, but do not expose classic font editing.

The intended steady state is successful bundled font registration, not fallback behavior.

## Configuration Model

### New Terminal Config Shape

The current shared `fontFamily` and `fontSize` settings should be split conceptually into dialog-only settings:

- `dialogFontFamily`
- `dialogFontSize`

Classic font family is not persisted in user configuration.

If implementation simplicity favors keeping an internal classic font constant rather than extending config types, that is preferred over introducing editable classic font fields.

### Migration

Existing persisted terminal config should migrate as follows:

- Old `fontFamily` value maps to `dialogFontFamily`.
- Old `fontSize` value maps to `dialogFontSize`.
- Classic ignores any legacy shared font setting.

This preserves the user’s dialog typography preferences across upgrades while forcing classic onto the stable bundled font.

## Settings UX

The settings panel should present mode-specific font behavior explicitly:

- Classic terminal font: display-only description such as `CaskaydiaCove Nerd Font Mono (bundled, fixed for stability)`.
- Dialog terminal font: editable font-family input and font-size input.

The copy should make it clear that:

- Both modes default to `CaskaydiaCove Nerd Font Mono`.
- Only dialog mode responds to font changes in settings.
- Classic mode intentionally locks its font for rendering stability.

## File And Module Boundaries

Expected implementation touchpoints:

- `src/domain/config/types.ts`
- `src/domain/config/model.ts`
- `src/domain/config/model.test.ts`
- `src/features/config/state/app-config-store.test.ts`
- `src/features/config/components/SettingsPanel.tsx`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/features/terminal/components/ClassicTerminalSurface.tsx`
- frontend startup path responsible for loading bundled fonts
- packaging configuration required to ship the font asset

The implementation should avoid spreading classic font logic across many components. A single shared constant or helper for the bundled classic font is preferred.

## Failure Handling

- If bundled font registration fails, the app should not crash.
- Classic should still try the bundled family name first, followed by a monospace fallback.
- The failure path is operational fallback only; it does not restore classic font customization.

No additional user-facing toggle is needed for this path.

## Testing Strategy

### Automated Tests

Add or update tests to cover:

- default config values use `CaskaydiaCove Nerd Font Mono` for dialog defaults
- legacy shared font config migrates to dialog-only settings
- dialog font settings normalize correctly
- classic font routing ignores dialog font-family changes
- settings store updates dialog font settings without mutating classic behavior

### Manual Verification

Verify these scenarios:

1. Fresh install:
   - both modes default to `CaskaydiaCove Nerd Font Mono`
2. Existing user with custom shared font:
   - dialog preserves prior font choice after migration
   - classic uses bundled `CaskaydiaCove Nerd Font Mono`
3. Changing dialog font to `JetBrains Mono`:
   - dialog updates immediately
   - classic remains on `CaskaydiaCove Nerd Font Mono`
4. Classic interactive workflows:
   - `vim`, `top`, `ssh`, `tmux`, and similar commands still work as before

## Risks

- Bundled font licensing and redistribution terms must be verified before release.
- Font registration timing must be handled carefully to avoid classic measuring before the bundled font is ready.
- Config migration must not silently drop the user’s dialog font preferences.

## Recommendation

Implement the bundled-font split model without introducing any classic font edit path. This is the cleanest way to preserve classic as a stable real terminal while keeping dialog visually flexible.
