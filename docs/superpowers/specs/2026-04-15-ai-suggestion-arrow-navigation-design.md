# AI Suggestion Arrow Navigation Design

Date: 2026-04-15

## Goal

Improve AI completion candidate navigation in the idle command composer so the interaction feels faster and more direct:

- When the suggestion bar has been explicitly opened, plain `ArrowUp` and `ArrowDown` should navigate the visible candidates.
- When the suggestion bar is not open, plain `ArrowUp` and `ArrowDown` should keep their existing terminal history behavior.

This change is intentionally limited to keyboard routing in the idle composer. It does not change completion generation, candidate ranking, AI suggestion sourcing, or history storage.

## Current Behavior

In [DialogIdleComposer.tsx](/home/zpc/projects/praw/.worktrees/ai-suggestion-arrow-navigation/src/features/terminal/components/DialogIdleComposer.tsx), candidate navigation currently requires `Ctrl+ArrowUp` and `Ctrl+ArrowDown`.

Plain `ArrowUp` and `ArrowDown` are reserved for composer history:

- `ArrowUp` enters history browsing or moves to the previous history item
- `ArrowDown` moves toward newer history or restores the current draft

This means the user has to switch mental models after explicitly opening the suggestion bar with `Tab`, even though the candidate list is already visible and focused as the active interaction target.

## Decision

Use a state-sensitive key routing rule:

- If the suggestion bar has been explicitly opened by the user and there are visible suggestions, plain `ArrowUp` and `ArrowDown` navigate suggestions.
- Otherwise, plain `ArrowUp` and `ArrowDown` keep their existing history semantics.

`Ctrl+ArrowUp` and `Ctrl+ArrowDown` remain supported as compatibility shortcuts.

## Interaction Rules

### Suggestion Bar Closed

- `ArrowUp` and `ArrowDown` continue to control composer history exactly as today.
- No new candidate-navigation behavior is introduced.

### Suggestion Bar Open

- `ArrowUp` moves the highlighted suggestion to the previous visible candidate.
- `ArrowDown` moves the highlighted suggestion to the next visible candidate.
- History browsing must not start while the suggestion bar is open.
- `ArrowRight` continues to accept the highlighted suggestion.
- `Escape` continues to close the suggestion bar.
- `Tab` continues to expose the suggestion bar.

### Phrase Completion

Phrase completion remains higher priority than async suggestions when phrase matches are active.

- If phrase completion is active, existing phrase-specific navigation behavior stays intact.
- This change only affects the visible suggestion bar path backed by `visibleSuggestions`.

## Implementation Scope

Primary file:

- [DialogIdleComposer.tsx](/home/zpc/projects/praw/.worktrees/ai-suggestion-arrow-navigation/src/features/terminal/components/DialogIdleComposer.tsx)

Required updates:

1. Reorder `onKeyDown` handling so explicit suggestion-bar navigation is checked before history navigation.
2. Gate plain `ArrowUp` and `ArrowDown` candidate navigation on:
   - `suggestionBarVisible === true`
   - `visibleSuggestions.length > 0`
3. Preserve current history behavior when the suggestion bar is not open.
4. Preserve existing `Ctrl+ArrowUp` and `Ctrl+ArrowDown` handling for compatibility.

No backend, bridge, terminal runtime, or transcript changes are part of this work.

## Testing

Update [DialogIdleComposer.test.tsx](/home/zpc/projects/praw/.worktrees/ai-suggestion-arrow-navigation/src/features/terminal/components/DialogIdleComposer.test.tsx) with focused behavior coverage:

- When the suggestion bar is open, plain `ArrowDown` moves selection to the next candidate.
- When the suggestion bar is open, plain `ArrowUp` moves selection to the previous candidate.
- When the suggestion bar is closed, plain `ArrowUp` still enters composer history.
- When the suggestion bar is closed, plain `ArrowDown` still follows existing history restore semantics.
- When the suggestion bubble is auto-opened but not explicitly opened, plain arrows still preserve history semantics.
- `ArrowRight` still accepts the highlighted candidate after plain-arrow navigation.

## Risks

- Key-priority regressions could accidentally break history browsing if suggestion-bar visibility is not used as the gating condition.
- Phrase completion and visible-suggestion navigation both use arrow keys, so ordering must remain explicit and easy to read.

## Non-Goals

- Opening the suggestion bar automatically when suggestions exist
- Changing candidate ranking or grouping
- Replacing history navigation with candidate navigation outside the explicit suggestion-bar state
- Changing AI mode transcript or terminal keyboard behavior
