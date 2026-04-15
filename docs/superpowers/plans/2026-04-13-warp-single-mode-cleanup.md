# Warp Single-Mode Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy dialog/classic terminal concepts and converge the app on one Warp-native interaction model with a more modern product UI.

**Architecture:** Keep PTY sessions and workspace timeline blocks as the runtime core, but delete the old dialog/classic view model, UI components, and mode config. Replace mode-specific settings and copy with single-mode workspace settings, then refresh the visible shell chrome, timeline, composer, and settings panel styling so the product reads as one coherent modern interface.

**Tech Stack:** React, Zustand, TypeScript, Vitest, CSS, xterm, Tauri PTY bridge

---

## File Structure

### Remove

- `src/domain/terminal/dialog.ts`
- `src/domain/terminal/dialog.test.ts`
- `src/features/terminal/components/DialogTerminalSurface.tsx`
- `src/features/terminal/components/DialogTerminalSurface.test.tsx`
- `src/features/terminal/components/DialogIdleComposer.tsx`
- `src/features/terminal/components/DialogIdleComposer.test.tsx`
- `src/features/terminal/components/DialogTranscript.tsx`
- `src/features/terminal/components/DialogTranscript.test.tsx`
- `src/features/terminal/components/LiveCommandConsole.tsx`
- `src/features/terminal/components/ClassicTerminalSurface.tsx`
- `src/features/terminal/components/ClassicTerminalSurface.test.tsx`

### Create / Repurpose

- `src/features/terminal/state/terminal-session-store.ts`
  - Lightweight per-tab terminal buffer/history metadata store without dialog/classic semantics
- `src/features/terminal/state/terminal-session-store.test.ts`
  - Store-level tests for buffer/history lifecycle

### Modify

- `src/features/terminal/hooks/useTerminalRuntime.ts`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/features/terminal/state/workspace-store.ts`
- `src/features/terminal/lib/close-policy.ts`
- `src/features/terminal/lib/close-policy.test.ts`
- `src/features/terminal/hooks/useGhostCompletion.ts`
- `src/features/terminal/hooks/useSuggestionEngine.ts`
- `src/domain/config/types.ts`
- `src/domain/config/model.ts`
- `src/domain/config/model.test.ts`
- `src/features/config/state/app-config-store.test.ts`
- `src/features/config/components/SettingsPanel.tsx`
- `src/features/config/lib/settings-panel-copy.ts`
- `src/app/styles.css`

---

## Tasks

### Task 1: Replace the legacy terminal view store with a session-only store

- [ ] Add a new `terminal-session-store` that keeps:
  - `buffers`
  - `sessionMeta` with `shell`, `cwd`, `recentCommands`
- [ ] Move buffer append/reset/remove behavior over from the old store
- [ ] Add `recordCommand`, `syncSessionMeta`, `removeSessionMeta`, `updateCwd`
- [ ] Port only the tests that still matter for buffers/history
- [ ] Update runtime, pane, and workspace code to use the new store

### Task 2: Delete dialog/classic domain and component code

- [ ] Remove `dialog.ts` and its tests
- [ ] Remove dialog/classic surface components and tests
- [ ] Remove any remaining imports and type references to `DialogState`, `PaneRenderMode`, `TerminalTabViewState`
- [ ] Simplify close-policy and pane minimum logic so they depend on workspace/session state only

### Task 3: Collapse terminal config to a single Warp-native mode

- [ ] Remove `preferredMode` from config types and normalization
- [ ] Remove classic/dialog wording from settings copy
- [ ] Keep only workspace-relevant font controls
- [ ] Update config tests to assert no visible terminal mode toggle remains

### Task 4: Refresh the visible Warp-native UI shell

- [ ] Modernize `TerminalPane` header chrome, title treatment, and pane frame
- [ ] Refine `WarpPaneSurface`, `WarpTimeline`, `WarpComposer`, and terminal block styling
- [ ] Refresh `SettingsPanel` layout and typography so it matches the new shell language
- [ ] Preserve existing shortcut/settings behavior while changing the presentation

### Task 5: Verification and cleanup

- [ ] Run focused tests for new stores, config, terminal components, and workspace flow
- [ ] Run broad terminal/config test suites and `npm run typecheck`
- [ ] Report any unrelated pre-existing failures separately instead of masking them
