# AI Mode Bypass Capsule Design

Date: 2026-04-15

## Goal

Refine the AI mode bypass prompt so it feels like a compact, always-available side composer instead of a separate floating overlay.

The updated experience should:

- keep a stable prompt entry visible while reading older AI output
- avoid colliding with the bottom composer area and jump controls
- feel visually integrated with the AI pane
- preserve the existing prompt transport path and failure handling

## Problem

The current bypass capsule solved prompt accessibility, but two issues remain:

1. The trigger sits in a corner that can overlap with other pane content.
2. The click target opens a detached overlay, which feels heavier and less elegant than the intended “side-channel” interaction.

The user wants the bypass entry to behave more like a docked side control:

- fixed at the vertical center of the right edge
- compact when idle
- expanding leftward into an input surface when activated

## Product Decision

Replace the corner-positioned floating capsule plus detached overlay with a right-edge inline expanding capsule.

Interaction model:

- In structured AI mode, a narrow capsule remains docked to the AI pane’s right edge at vertical center.
- Clicking the capsule expands it leftward into a compact input composer.
- The expanded composer uses adaptive width rather than a fixed pixel width.
- `Enter` submits.
- `Shift+Enter` inserts a newline.
- `Escape` collapses the composer.
- Successful submit collapses the composer.
- Clicking elsewhere does not collapse the composer.
- Draft text persists across collapse and reopen until a successful submit clears it.

This remains a bypass path, not the canonical AI composer.

## Non-Goals

- Replacing the main AI composer
- Making the bypass entry draggable or user-configurable
- Adding outside-click dismissal
- Supporting the old detached overlay and the new inline form at the same time
- Changing prompt transport or agent bridge behavior

## Recommended Approach

Use a docked side-composer component rendered inside the AI pane.

Why this is the right tradeoff:

- It matches the desired interaction exactly.
- It removes the visual discontinuity of the old modal-like overlay.
- It keeps state local to AI mode and avoids introducing new global UI abstractions.
- It allows styling and animation to stay scoped to the existing AI workflow surface.

Lower-cost alternatives were considered and rejected:

1. Keep the old overlay and only move the trigger to the right edge.
   This lowers implementation cost but keeps the less elegant detached interaction.

2. Add full position customization.
   This is flexible but unnecessary for the requested outcome and adds avoidable config and testing surface.

## Architecture

### 1. Surface Ownership

[AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) should continue to own:

- expanded/collapsed state
- draft state
- transient submit error state
- submit lifecycle

This keeps the bypass behavior local to AI mode and avoids coupling it to terminal-global state.

### 2. Component Boundary

The current [AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should stop behaving like an overlay shell.

It should become a focused presentation component for the docked right-edge composer, responsible only for:

- rendering collapsed and expanded visual states
- managing textarea focus when expanded
- exposing `onChange`, `onSubmit`, and `onCollapse`
- handling keyboard shortcuts:
  - `Enter` submit
  - `Shift+Enter` newline
  - `Escape` collapse

It should not:

- understand structured vs raw transport
- call Tauri directly
- alter transcript state
- own persistence outside its current draft value props

### 3. Prompt Transport Boundary

Prompt delivery must continue to reuse the existing AI prompt submission chain:

- `AiWorkflowSurface` submit handler
- existing `submitAiPrompt(...)`
- existing `sendAiPrompt(...)`

This keeps the bypass path transport-agnostic across:

- structured bridge mode
- raw-fallback/native terminal mode

No second prompt stack should be introduced.

## Layout and Motion

### Default Position

The capsule is anchored to the right edge of the AI pane and vertically centered.

Placement rules:

- right: flush or near-flush to the pane edge
- vertical position: centered within the pane body
- z-index: above transcript content, below modal-level surfaces

This position is preferred over corners because it reduces collisions with:

- bottom composer controls
- jump-to-latest affordances
- top toolbar actions

### Expanded Direction

The composer expands leftward from the right edge anchor point.

This preserves the “docked” feeling and avoids overflowing outside the pane.

### Width

Use adaptive width rather than a fixed width.

Recommended rule:

- `clamp(280px, 40%, 360px)`

This gives:

- enough room for practical prompt entry
- stable behavior in larger panes
- reasonable containment in smaller panes

### Visual Language

The collapsed state should remain subtle and low-attention.

The expanded state should feel like the same object growing into a usable input, not like a separate dialog. That means:

- shared border radius language
- consistent material treatment
- transform/width transition rather than pop-in overlay behavior

## Focus and Dismissal Rules

When the composer expands:

- focus moves into the textarea
- caret lands at the end of the existing draft

When the user presses `Escape`:

- the composer collapses
- draft is preserved

When submit succeeds:

- the composer collapses
- draft clears

When the user clicks elsewhere:

- do nothing
- keep the composer open
- preserve focus behavior unless another control explicitly takes focus

This is intentional. The bypass composer is meant to stay available while the user reads and interacts with other content.

## Runtime Compatibility

The right-edge composer should only be shown when AI mode is using the structured surface.

In raw-fallback/native terminal mode:

- do not render the docked bypass capsule/composer
- rely on the native terminal surface as the active interaction model

This matches the current direction of removing redundant AI-mode status chrome in raw fallback.

## Error Handling

If submit fails:

- keep the composer expanded
- preserve the draft
- show the existing lightweight inline error text

If the terminal session is not accepting input:

- keep the collapsed affordance visible in structured AI mode
- disable submit while preserving the draft
- show the existing blocked-state message when expanded

## Testing

Update and extend tests around [AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) and the bypass composer component.

Required coverage:

- capsule renders at all times in structured AI mode
- raw-fallback mode does not render the structured bypass capsule
- clicking capsule expands the composer
- expanded composer autofocuses the textarea
- `Enter` submits
- `Shift+Enter` does not submit
- `Escape` collapses and preserves draft
- successful submit collapses and clears draft
- clicking outside does not collapse the composer
- disabled session state prevents submit but keeps entry available

## Risks

- If the new inline composer still behaves like an overlay internally, the UX will feel visually inconsistent even if positioned correctly.
- If outside clicks collapse the composer despite the requirement, the feature will regress into the same “fragile capture” behavior the bypass path is meant to avoid.
- If raw-fallback keeps showing the structured capsule, the surface model will become confusing.

## Recommendation

Implement the bypass input as a right-edge docked expanding composer with adaptive width and explicit collapse semantics:

- right-edge vertical-center anchor
- leftward inline expansion
- collapse only on `Escape` or successful submit
- preserve draft across collapse
- keep transport reuse exactly as-is

This is the smallest change that materially improves elegance, spatial stability, and perceived polish.
