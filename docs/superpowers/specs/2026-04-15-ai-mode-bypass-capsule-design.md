# AI Mode Bypass Capsule Design

Date: 2026-04-15

## Goal

Refine the AI mode bypass prompt so it behaves like a permanent right-edge side composer instead of a detachable floating prompt surface.

The updated experience should:

- keep a stable prompt affordance always visible in structured AI mode
- avoid visual disappearance after submit
- expand into an input surface that feels nearly as wide as the current AI pane
- support multiline drafting with graceful auto-resizing
- preserve the existing prompt transport path and failure handling

## Problem

The original bypass capsule solved one problem, but the interaction still falls short in several ways:

1. The current dock can be visually easy to miss because the collapsed state is too close to the edge and too low-emphasis.
2. The expanded state is too narrow relative to the available pane width.
3. The textarea does not grow naturally with the amount of text the user is drafting.
4. The interaction currently reads too much like a hidden side panel instead of a permanent side-channel composer.

The intended experience is:

- a visibly persistent right-edge capsule
- always present in structured AI mode
- expanding leftward into a wide inline composer
- collapsing back to the right edge without disappearing

## Product Decision

Keep the bypass capsule permanently mounted in structured AI mode and treat collapse as “return to docked capsule”, not “remove the control”.

Interaction model:

- In structured AI mode, a docked capsule remains permanently visible at the right edge, vertically centered.
- Clicking the capsule expands it leftward into a wide input composer.
- The expanded composer should feel close to the full width of the AI pane, while still leaving a small visual margin.
- `Enter` submits.
- `Shift+Enter` inserts a newline.
- `Escape` collapses the composer back to the docked capsule.
- Successful submit collapses the composer back to the docked capsule and clears the draft.
- Clicking elsewhere does not collapse the composer.
- Failed submit keeps the composer expanded and preserves the draft.
- Collapsing without submit preserves the draft.

This remains a bypass path, not the canonical AI composer.

## Non-Goals

- Replacing the main AI composer
- Adding user-configurable positions
- Adding outside-click dismissal
- Making the bypass input draggable
- Changing prompt transport or agent bridge semantics
- Rendering the structured bypass control in raw-fallback/native terminal mode

## Recommended Approach

Use a permanently mounted right-edge dock component that switches between:

- collapsed capsule state
- expanded inline composer state

Why this is the right tradeoff:

- It directly matches the user’s mental model of a permanent side-channel entry.
- It removes the ambiguity of “did the control disappear or just collapse?”
- It preserves a strong visual anchor in AI mode.
- It improves compositional elegance without touching transport architecture.

Alternatives considered and rejected:

1. A narrow expanding composer with modest width.
   Easier to style, but too constrained for real prompt drafting.

2. A detachable floating overlay.
   Higher visual discontinuity and weaker sense of permanent availability.

3. User-configurable placement.
   Too much configuration surface for a problem that now has a preferred default answer.

## Architecture

### 1. Surface Ownership

[AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) should continue to own:

- expanded/collapsed state
- draft state
- transient submit error state
- submit lifecycle

This keeps the bypass feature local to AI mode and avoids coupling it to terminal-global state.

### 2. Component Boundary

[AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should remain the presentation component for the right-edge docked composer.

It should be responsible for:

- rendering the docked capsule shell
- rendering expanded and collapsed visual states
- focusing the textarea when expanded
- exposing `onExpand`, `onChange`, `onSubmit`, and `onCollapse`
- handling keyboard behavior:
  - `Enter` submit
  - `Shift+Enter` newline
  - `Escape` collapse

It should not:

- understand structured vs raw transport
- call Tauri directly
- mutate transcript state
- own prompt transport or session routing

### 3. Prompt Transport Boundary

Prompt delivery must continue to reuse the existing AI prompt submission chain:

- `AiWorkflowSurface` submit handler
- existing `submitAiPrompt(...)`
- existing `sendAiPrompt(...)`

No second prompt stack should be introduced.

## Layout and Motion

### Default Position

The capsule is anchored to the right edge of the AI pane and vertically centered.

Placement rules:

- right edge alignment: visually flush or nearly flush with the pane edge
- vertical position: centered within the pane body
- z-index: above transcript content, below modal-level surfaces

This keeps the affordance out of the top toolbar and away from bottom composer conflicts.

### Persistent Presence

The dock remains mounted in structured AI mode at all times.

Collapsed state means:

- the capsule is still visible
- the input is hidden or reduced to zero-width
- the user still has a stable visual target

Expanded state means:

- the capsule remains the anchor point on the right edge
- the composer extends leftward from that anchor

### Expanded Width

The expanded width should be close to the current AI pane width, not a narrow side panel.

Preferred rule:

- use left and right visual margins instead of a small width clamp
- practical target is “nearly full width”, leaving roughly `12px` to `16px` margin per side

Implementation preference:

- anchor the dock to the right edge
- define the expanded panel using absolute layout or width math derived from pane bounds
- avoid a small static width such as `320px` or `360px`

The intended result is that the expanded composer reads like a wide writing surface rather than a thin popout.

### Height Behavior

The textarea should auto-resize with the amount of input.

Rules:

- collapsed state: no visible textarea surface
- expanded state initial height: single-line friendly
- textarea height grows with content based on `scrollHeight`
- textarea growth is bounded by a graceful maximum height
- once maximum height is reached, internal scrolling begins

Recommended range:

- minimum height around `40px`
- maximum height around `140px` to `160px`

This keeps the field expressive without dominating the pane.

### Visual Language

The dock should feel like one continuous control:

- collapsed capsule and expanded composer must share material, border, and motion language
- expansion should read as the capsule unfolding into a larger surface
- collapse should read as the composer folding back into the dock

The interaction should not resemble a detached modal or floating window.

## Focus and Dismissal Rules

When the composer expands:

- focus moves into the textarea
- caret lands at the end of the existing draft

When the user presses `Escape`:

- the composer collapses back to the docked capsule
- draft is preserved

When submit succeeds:

- the composer collapses back to the docked capsule
- draft clears

When the user clicks elsewhere:

- do nothing
- keep the composer open
- do not forcibly collapse the dock

This is intentional. The bypass composer should remain stable during reading and peripheral interaction.

## Runtime Compatibility

The right-edge dock should only be rendered in structured AI mode.

In raw-fallback/native terminal mode:

- do not render the structured bypass dock
- rely on the native terminal surface as the active interaction model

This avoids UI conflicts between the structured side composer and the raw terminal path.

## Error Handling

If submit fails:

- keep the composer expanded
- preserve the draft
- show the existing lightweight inline error text

If the terminal session is not accepting input:

- keep the dock visible in structured AI mode
- disable submit while preserving draft
- show the existing blocked-state message when expanded

## Testing

Update and extend tests around [AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) and the dock composer component.

Required coverage:

- dock remains mounted in structured AI mode
- raw-fallback mode does not render the structured bypass dock
- clicking capsule expands the composer
- expanded composer autofocuses the textarea
- `Enter` submits
- `Shift+Enter` does not submit
- `Escape` collapses while preserving draft
- successful submit collapses and clears draft
- clicking outside does not collapse the composer
- the composer reopens from a visible dock after submit
- textarea height grows with additional lines
- textarea height is capped within the allowed visual range
- disabled session state prevents submit but keeps the dock visible

## Risks

- If the dock is technically mounted but visually too close to the edge, users may still perceive it as missing.
- If expanded width remains too conservative, the interaction will continue to feel cramped.
- If textarea growth is unbounded, the dock will overtake the pane and reduce usability.
- If textarea growth is not implemented at all, the interaction will feel unfinished relative to the requested UX.

## Recommendation

Implement the bypass input as a permanently mounted, right-edge, vertically centered dock with:

- always-visible collapsed capsule in structured AI mode
- leftward expansion into a near-full-width composer
- auto-growing textarea with bounded height
- collapse only on `Escape` or successful submit
- draft preservation across collapse
- unchanged prompt transport reuse

This is the smallest change that aligns the feature with the intended “elegant, always-there side composer” experience.
