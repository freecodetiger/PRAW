# AI Mode Bypass Capsule Design

Date: 2026-04-15

## Goal

Provide a low-friction side-channel input entry for AI mode so the user can send a prompt to the active Codex session even when the native Codex input area has scrolled out of view.

This design is intentionally not a replacement for the native Codex input surface. It adds a separate bypass entry:

- a small floating capsule that is always visible in AI mode
- a click-to-open overlay input
- `Enter` sends directly to the real Codex session
- successful send closes and clears the overlay

## Problem

In current AI mode usage, the real Codex input position can move with the transcript and leave the visible area while the user is reading older content. Once that happens:

- the user loses a stable place to start typing
- pressing keys can snap focus back toward the latest input area
- inspiration capture becomes fragile

The desired experience is not a fixed bottom composer. The desired experience is a lightweight, always-available bypass prompt that can summon a temporary input surface without disturbing the current reading position.

## Non-Goals

- Replacing the native Codex input UI
- Rebuilding Codex chat as a custom transcript/composer product
- Adding keyboard-shortcut-only activation
- Making this bypass prompt global across non-AI terminal modes
- Introducing a second prompt transport protocol separate from the existing AI send path

## Product Decision

Use an always-visible floating capsule in AI mode.

Interaction model:

- AI mode always shows a small capsule entry in a low-attention corner position.
- Clicking the capsule opens a focused overlay input.
- The overlay owns its own temporary draft state.
- `Enter` submits directly to the active Codex session.
- `Shift+Enter` inserts a newline.
- `Escape` closes without sending.
- After successful send, the overlay closes and the draft clears.
- If send fails, the overlay stays open and preserves the draft.

This is a bypass path, not the canonical prompt UI. It exists specifically to support “capture thought immediately while reading”.

## Feasibility

This feature is feasible in the current architecture without reworking the AI bridge model.

The key reason is that prompt transport is already centralized:

- [TerminalPane.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx) already exposes `submitAiPrompt(...)`
- [ai-prompt-transport.ts](/home/zpc/projects/praw/src/features/terminal/lib/ai-prompt-transport.ts) already routes prompts correctly

That existing send path already handles both runtime modes:

- `structured` bridge mode via `submitTerminalAgentPrompt(...)`
- `raw-fallback` / native terminal mode via terminal paste + enter

Therefore the bypass capsule does not need to understand Codex protocol details. It only needs to collect user input and hand the normalized prompt to the existing send path.

## Architecture

### 1. Surface Ownership

[AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) should own the bypass capsule UI state:

- whether the capsule overlay is open
- the temporary bypass draft
- transient send error display if needed
- submit-close-clear behavior

This keeps the bypass feature local to AI mode and avoids pushing UI state up into unrelated terminal surfaces.

### 2. Overlay Component Responsibility

[AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should remain a focused presentation component:

- render the overlay shell
- autofocus the textarea on open
- expose `onChange`, `onSubmit`, and `onClose`
- map keyboard behavior:
  - `Enter` without `Shift` submits
  - `Shift+Enter` preserves multiline editing
  - `Escape` closes

It should not:

- decide whether the session is structured or raw
- talk directly to Tauri
- paste into xterm itself
- mutate transcript state on its own

### 3. Prompt Transport Boundary

The bypass overlay must reuse the existing AI send path instead of inventing a second one.

Required behavior:

- bypass overlay submit calls the same high-level AI prompt submission function already used by AI mode
- that function continues to delegate to [ai-prompt-transport.ts](/home/zpc/projects/praw/src/features/terminal/lib/ai-prompt-transport.ts)
- transport remains the single place that decides:
  - structured submit
  - native terminal paste + enter fallback

This boundary is the main maintainability constraint for the feature.

## Visibility and Placement

The capsule entry should be always visible in AI mode, regardless of transcript scroll position.

Placement direction:

- default to a small floating button near the lower-right corner of the AI surface
- keep it visually quiet so it does not compete with the transcript or toolbar
- avoid placing it where it overlaps the primary send button, resume picker, or jump-to-latest affordance

The exact corner can be tuned during implementation if the current AI layout exposes a stronger conflict, but the behavior requirement is fixed: the capsule is persistent and easy to rediscover.

## Focus Model

Focus rules:

- opening the overlay moves focus into the overlay textarea
- while overlay is open, typing should stay in the overlay instead of reaching the native Codex input
- closing the overlay should not force-scroll the transcript
- successful submit should close the overlay without moving the user’s viewport

This is important: the overlay is supposed to preserve reading context, not yank the user back to the latest transcript position.

## Runtime Mode Compatibility

The bypass capsule must work in both AI mode transport states:

### Structured Bridge

- submit through the existing structured prompt path
- no terminal paste fallback should be used when structured submit is available

### Raw Fallback / Native Terminal

- submit through the existing native fallback transport
- the prompt must go to the real Codex session, not a fake front-end composer

This is the core acceptance condition for the feature.

## Error Handling

If submit fails:

- keep the overlay open
- preserve the entered draft
- show a lightweight inline error message inside the overlay shell

Do not silently close on failure.

If the AI session is not ready to accept input:

- disable submit or show an explicit blocked-state message
- keep the capsule visible so the user still understands where the bypass entry lives

## Testing

Add focused UI tests around [AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) and [AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx):

- capsule renders in AI mode even when the transcript is populated
- clicking capsule opens overlay
- overlay autofocuses textarea
- `Enter` submits through the existing AI submit handler
- `Shift+Enter` does not submit
- `Escape` closes the overlay
- successful submit closes and clears the overlay
- failed submit keeps overlay open and preserves draft
- structured and raw-fallback AI states both keep the capsule path available

## Risks

- If the overlay directly manipulates terminal IO instead of reusing existing prompt transport, the feature will drift into a second AI input stack and become fragile.
- If the capsule visually competes with existing AI controls, it will feel noisy instead of helpful.
- If opening or closing the overlay changes scroll position, the feature will fail its primary reading-context use case.

## Recommendation

Implement the bypass capsule as a local AI-mode UI feature with strict transport reuse:

- UI state in `AiWorkflowSurface`
- presentation in `AiModePromptOverlay`
- sending delegated to the existing `submitAiPrompt -> sendAiPrompt` chain

That is the cleanest way to make the feature feel native without creating a second, conflicting Codex input architecture.
