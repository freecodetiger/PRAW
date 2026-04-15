# AI Mode Centered Prompt Capsule Design

Date: 2026-04-15

Supersedes: [2026-04-15-ai-mode-bypass-capsule-design.md](/home/zpc/projects/praw/docs/superpowers/specs/2026-04-15-ai-mode-bypass-capsule-design.md)

## Goal

Replace the current side-expanding AI-mode bypass capsule with a cleaner interaction:

- collapsed state: a small `Prompt` capsule anchored on the right side
- expanded state: the trigger disappears and is replaced by a single centered floating input capsule
- input surface width tracks the active pane width instead of behaving like a narrow side dock
- the expanded state uses no dedicated send button
- submit remains keyboard-first with `Enter`

This design must fix the current mismatch where the capsule reads as left-biased or side-docked instead of acting like a lightweight centered quick-input surface.

## Problem

The current bypass composer still behaves like a dock:

1. The collapsed trigger does not consistently read as a right-edge affordance.
2. The expanded surface still inherits side-panel logic instead of feeling like a centered temporary input lane.
3. Keeping a visible send button makes the control heavier than necessary for an auxiliary prompt path.
4. The present dock metaphor competes with the main AI workflow instead of quietly supporting it.

The desired behavior is more minimal:

- a small right-side trigger when idle
- a centered single-piece input capsule when active
- no extra chrome beyond the input itself
- no dismissal surprises while draft text exists

## Product Decision

Adopt a two-state interaction:

1. Collapsed state
   - show a small right-side `Prompt` capsule
   - the capsule is the only visible affordance

2. Expanded state
   - remove the right-side trigger from view immediately
   - show one centered floating input capsule
   - the input capsule becomes the only active quick-input surface
   - there is no dedicated send button

Keyboard rules:

- `Enter` submits
- `Shift+Enter` inserts a newline
- `Escape` collapses only when the draft is empty
- successful submit collapses only after the draft has been cleared
- outside click does not collapse

Visibility rules:

- collapse is instantaneous
- no hide animation is required
- a non-empty draft blocks collapse

## Non-Goals

- Replacing the main composer in structured AI mode
- Introducing drag-and-drop placement
- Adding outside-click dismissal
- Adding a dedicated send button
- Introducing a second prompt transport path
- Making the quick capsule configurable per provider

## Recommended Approach

Keep the feature owned by the AI workflow surface, but change the overlay metaphor from "right-edge expanding dock" to "right-edge trigger plus centered floating input".

Why this is the correct tradeoff:

- It preserves the user's requested right-side idle affordance.
- It produces a much cleaner active state than a split capsule or side composer.
- It keeps the auxiliary input visually separate from the main conversation composer.
- It minimizes chrome while still preserving draft safety.

Alternatives considered and rejected:

1. Split input plus send button
   Cleaner than the current dock, but still heavier than necessary.

2. Persistent right-edge expanding composer
   Too close to the old dock model and still visually side-biased.

3. Centered overlay with outside-click dismissal
   Too easy to dismiss accidentally while reading AI output.

## Architecture

### 1. State Ownership

[AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) remains the owner of:

- expanded/collapsed state
- bypass draft state
- transient submit error state
- submit lifecycle

No global terminal state should be added for this feature.

### 2. Presentation Boundary

[AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should be reshaped into a two-state presenter:

- collapsed renderer for the small right-side `Prompt` capsule
- expanded renderer for the centered single input capsule

It should not:

- understand provider transport
- call terminal commands directly
- own transcript or session state

### 3. Input Reuse

[StructuredAiPromptInput.tsx](/home/zpc/projects/praw/src/features/terminal/components/StructuredAiPromptInput.tsx) should still provide:

- textarea behavior
- slash suggestion behavior where applicable
- auto-resize logic
- `Enter` / `Shift+Enter` keyboard handling

The overlay should reuse this input instead of reimplementing text behavior.

### 4. Prompt Transport

Prompt delivery must continue to route through the existing submission chain:

- `AiWorkflowSurface` submit handler
- existing `submitAiPrompt(...)`
- existing `sendAiPrompt(...)` or structured submission path

No separate transport stack should be introduced.

## Layout

### Collapsed State

The idle trigger is a small capsule anchored near the right side of the active AI pane.

Rules:

- right-side placement is explicit and visually unambiguous
- vertical position remains around the pane midpoint
- the trigger remains visible whenever the runtime capabilities allow the quick prompt surface

This directly addresses the user's complaint that the current capsule appears left-biased.

### Expanded State

When opened, the trigger disappears and the active UI becomes a single centered floating capsule.

Rules:

- horizontally centered within the visible pane
- vertically positioned around the pane midpoint
- width derived from pane width with safe horizontal margins
- visually a single full pill, not two joined pieces

Preferred width behavior:

- use pane-relative width rather than fixed pixels
- keep a minimum side margin so the capsule never touches pane edges
- keep a reasonable max width so very large panes still look deliberate

### Height

The input capsule starts as a single-line field and grows with content.

Rules:

- minimum height around `40px`
- maximum height around `140px` to `160px`
- after maximum height, internal scrolling begins
- the outer capsule should keep its rounded silhouette while growing

## Interaction Rules

### Expand

When the user clicks the right-side `Prompt` capsule:

- the collapsed capsule disappears immediately
- the centered input capsule appears
- focus moves into the input
- caret lands at the end of the existing draft

### Collapse

The expanded capsule may collapse only when the draft is empty.

Allowed collapse cases:

- user presses `Escape` with an empty draft
- submit succeeds and the draft has been cleared

Disallowed collapse cases:

- clicking outside
- pressing `Escape` while text remains
- failed submit

### Submit

Submit remains keyboard-first:

- `Enter` submits
- `Shift+Enter` inserts newline
- on success, clear draft and collapse immediately
- on failure, preserve draft and stay expanded

## Runtime Compatibility

This quick prompt affordance should continue to be controlled by runtime capabilities rather than a hardcoded structured-only assumption.

If a runtime advertises bypass capsule support, the same interaction model applies:

- collapsed right-side trigger
- centered expanded input capsule

This keeps the feature compatible with raw-fallback runtimes such as the current `codex` / `qwen` direction.

## Error Handling

If prompt submission fails:

- keep the centered capsule open
- preserve the full draft
- render the existing lightweight error text

If the session is not currently accepting input:

- keep the idle trigger visible
- expanded state stays disabled
- preserve draft text until the user clears or submits later

## Testing

Required test updates should cover:

1. Right-side collapsed placement contract in style tests
2. Expanded state rendering a centered single input capsule instead of a side dock
3. Trigger disappearing while expanded
4. No dedicated send button in expanded state
5. `Escape` collapses only when draft is empty
6. Successful submit clears draft and collapses
7. Failed submit preserves draft and keeps the capsule expanded
8. The feature remains available in runtimes that advertise bypass-capsule capability, including raw-fallback

## Implementation Notes

- Prefer replacing the old side-dock container structure instead of layering centered behavior on top of it.
- Keep style ownership localized to [styles.css](/home/zpc/projects/praw/src/app/styles.css) and component ownership localized to [AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx).
- Avoid introducing new store fields unless existing component-local state proves insufficient.
