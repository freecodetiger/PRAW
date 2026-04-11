---
title: Decoupled Settings Panel
date: 2026-04-10
---

# Context

- The current `App` UI only shows metadata and renders `TerminalWorkspace`; there is no surfaced way to edit the active config, but the config store already exposes patch helpers (`patchTerminalConfig` and `patchAiConfig`) that persist changes.
- The new settings surface must stay decoupled from terminal/session internals while letting a user edit the `terminal` and `ai` sections of the app config.
- There is no existing drawer or modal infrastructure within the owned files, so the implementation must live inside `App.tsx`, `styles.css`, and new components under `src/features/config/components`.

# Goals

1. Surface `terminal.defaultShell`, `terminal.defaultCwd`, `terminal.fontFamily`, `terminal.fontSize`, `ai.provider`, `ai.model`, and `ai.enabled` in a lightweight UI.
2. Keep the implementation decoupled from the terminal workspace by rendering the panel as an overlay/drawer that simply reads from and patches the config store.
3. Trigger the panel from the header and allow immediate persistence via the existing patch helpers, keeping session crossings minimal.

# Proposed Design

## Entry and Layout

- Add a toggle control in the header (alongside the metadata pills) that flips a `settingsOpen` state in `App`. When open, render a drawer component that layers over the `<main>` area but sits on top of the existing terminal content so the terminal layout remains untouched.
- The drawer should have an overlay to dim the workspace and a close button so it feels decoupled from the terminal logic.
- Since the user had not yet replied to the clarifying question, assume the immediate persistence flow (no separate save/apply step); the drawer updates the store as soon as an input changes.

## Drawer Component

- Create a `ConfigDrawer` component inside `src/features/config/components/` that:
  1. Reads the current `config` via `useAppConfigStore`.
 2. Divides the controls into "Terminal" and "AI" sections.
 3. Renders inputs for each required field: text fields for strings, a number input for `fontSize`, and a checkbox for `ai.enabled`.
  4. Uses `patchTerminalConfig` or `patchAiConfig` in `onChange` handlers to persist values immediately.
  5. Exposes a close button that calls a provided `onClose` prop.

- The component should treat the config store as a single source of truth and not manage its own form state beyond local convenience (e.g., coerce `fontSize` back to a number before patching).

## Styling

- Extend `src/app/styles.css` with:
  1. Header button styles to differentiate the settings toggle from the metadata badges.
  2. Drawer and overlay styles that use the existing CSS variables and match the application's aesthetic (dark surfaces with soft border).
  3. Input styles so the fields look intentional and readable inside the drawer.

- Avoid modifying any terminal-specific styles; the drawer should overlay the workspace without repositioning it.

# Alternatives Considered

1. Modal with explicit save/cancel: requires additional form state and introduces an extra confirmation step, which felt unnecessary once the store already handles patching.
2. Inline configuration area below the header: would require reducing workspace space and blur the visual separation, so it was not recommended.

# Testing

- Manual: open the drawer, edit each field, and verify the header metadata updates immediately (since `App` already reads from the store) and that closing/reopening reflects current values.
- Automated: no changes to the owned files require new tests beyond possibly light smoke tests; the behavior is primarily visual/stateful so rely on manual verification.

# Assumptions

- Without a reply to the clarifying question, we proceed with the header toggle + immediate persistence behavior. If a save/apply step is desired, the drawer's existing structure can be adapted later with minimal coupling.
