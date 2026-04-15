# AI Mode Header Prompt Trigger Design

Date: 2026-04-15

Supersedes the trigger-placement portion of: [2026-04-15-ai-mode-centered-prompt-capsule-design.md](/home/zpc/projects/praw/docs/superpowers/specs/2026-04-15-ai-mode-centered-prompt-capsule-design.md)

## Goal

Move the AI-mode quick prompt trigger out of the content area and into the pane header, while keeping the actual prompt input centered in the pane body.

The updated experience should:

- remove the floating content-area `Prompt` capsule trigger
- add a hard-edged rectangular quick prompt trigger in the pane header
- place the trigger immediately to the left of the existing `AI MODE` indicator
- keep the expanded input centered in the pane content area
- make the expanded input look like a hard-edged command box rather than a capsule
- preserve the current submit, draft, and collapse rules

## Problem

The content-area floating trigger no longer matches the desired visual language:

1. It still reads like a capsule even after the expanded input moved toward a harder rectangle style.
2. It competes with AI transcript content because it lives inside the scrollable visual field.
3. It does not align with the application's pane-header chrome, where mode and pane controls already live.
4. The app's overall style is more terminal/panel-oriented than soft floating-pill UI.

The quick prompt entry point should feel like a pane capability, not a decorative overlay.

## Product Decision

Use a header trigger plus centered body input model.

Collapsed state:

- render a rectangular `Prompt` button in the pane header
- place it directly before the `AI MODE` badge
- do not render a content-area floating trigger

Expanded state:

- keep the header trigger visible as the stable command entry point
- render the quick prompt input centered in the pane content area
- use a hard-edged rectangular input style
- avoid capsule silhouettes and repeated outer shells

Interaction rules stay unchanged:

- `Enter` submits
- `Shift+Enter` inserts a newline
- `Escape` collapses only when the draft is empty
- successful submit clears the draft and collapses
- failed submit preserves the draft and keeps the input open
- clicking outside does not collapse

## Non-Goals

- Expanding the input inline inside the pane header
- Adding a send button
- Adding outside-click dismissal
- Making trigger placement configurable
- Changing AI prompt transport
- Changing raw-fallback vs structured runtime behavior

## Recommended Approach

Split the trigger from the overlay:

- `TerminalPane` owns the pane-header trigger placement because it already renders `AI MODE`.
- `AiWorkflowSurface` continues to own quick prompt state, draft, submit lifecycle, and centered overlay rendering.
- `AiModePromptOverlay` becomes the expanded input presenter only; it should not render the collapsed trigger.

This keeps chrome concerns in the pane header and prompt-input concerns in the AI workflow surface.

Alternatives considered and rejected:

1. Keep the content-area trigger and only restyle it as a rectangle.
   This fixes the shape but keeps the wrong spatial model.

2. Expand the input directly from the header.
   This connects trigger and input visually, but it compresses the header and makes multiline prompts awkward.

3. Keep a floating right-edge trigger and centered rectangular input.
   This still leaves a decorative overlay in the content field and does not match the hard pane chrome.

## Architecture

### 1. Header Trigger

[TerminalPane.tsx](/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx) should render the quick prompt trigger when:

- the pane is in AI workflow mode
- the runtime capabilities allow the bypass prompt surface

The trigger should be placed before the existing `AI MODE` indicator.

The trigger should be a hard rectangular button, not a capsule.

### 2. State Ownership

[AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) should continue to own:

- whether the quick prompt input is expanded
- the bypass draft
- submit state
- submit error state
- empty-draft collapse guard

Because the trigger moves outside the AI workflow body, `TerminalPane` needs a clean way to request that the body quick prompt opens.

Recommended implementation:

- add a numeric `quickPromptOpenRequestKey` prop to `AiWorkflowSurface`
- increment the key from `TerminalPane` when the header trigger is clicked
- in `AiWorkflowSurface`, use an effect to open the quick prompt when the key changes

This avoids moving draft or submit state up into `TerminalPane`.

### 3. Overlay Presenter

[AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should stop rendering the collapsed trigger.

It should render nothing when collapsed, and render only the centered input when expanded.

It remains responsible for:

- displaying the centered input
- passing keyboard handlers through `StructuredAiPromptInput`
- rendering status and error text

### 4. Capability Boundary

The header trigger should use the same capability decision as the current overlay:

- show only when `showsBypassCapsule` is true
- continue to work for raw-fallback runtimes that advertise quick prompt support

Do not hardcode this to structured-only mode.

## Layout

### Header Trigger

The trigger should sit in the pane header before `AI MODE`.

Visual rules:

- rectangular, low-radius shape
- compact height matching the pane header
- explicit border
- no pill radius
- no large floating shadow
- hover/focus styling consistent with other pane-header controls

Suggested label:

- `Prompt`

### Centered Input

The expanded input stays centered in the content area.

Visual rules:

- width remains pane-relative
- no duplicate outer card shell
- visible input is the textarea itself
- hard-edged rectangle with low radius, around `6px` to `8px`
- clear border and background
- restrained shadow or no shadow

This should feel like a terminal command box rather than a soft chat bubble.

## Interaction

### Open

When the user clicks the header `Prompt` button:

- centered quick prompt input opens
- focus moves into the input
- existing draft, if any, is preserved

### Close

The quick prompt input can collapse only when the draft is empty:

- pressing `Escape` with an empty draft collapses
- successful submit clears the draft, then collapses

The input must not collapse when:

- draft text is non-empty
- submit fails
- the user clicks outside

### Submit

Submit rules remain:

- `Enter` submits
- `Shift+Enter` inserts a newline
- on success, clear draft and collapse
- on failure, preserve draft and show the existing lightweight error text

## Testing

Required coverage:

1. AI workflow pane header renders the rectangular quick prompt trigger before `AI MODE`.
2. The content-area floating `Prompt` trigger is no longer rendered.
3. Clicking the header trigger opens the centered prompt input.
4. The centered input preserves existing submit and collapse behavior.
5. Style tests assert the header trigger is rectangular, not pill-shaped.
6. Style tests assert the centered input remains hard-edged and has no duplicate outer card shell.
7. Raw-fallback panes that advertise quick prompt support still expose the header trigger.

## Implementation Notes

- Prefer a small prop bridge from `TerminalPane` to `AiWorkflowSurface` over lifting all bypass state upward.
- Do not introduce a global store field for the open state unless local prop bridging proves insufficient.
- Keep the quick prompt transport path unchanged.
- Keep the naming neutral: even if CSS retains some legacy `bypass` names, new tests should describe the user-visible `quick prompt` behavior.
