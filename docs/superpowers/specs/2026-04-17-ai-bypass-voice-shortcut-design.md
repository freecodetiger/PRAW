# AI Bypass Voice Shortcut Design

Date: 2026-04-17

## Goal

Add a stable keyboard shortcut that can:

- open the AI bypass composer
- start voice capture immediately
- stop voice capture on the next press
- leave the transcript in the bypass draft so the user can press `Enter` to send manually

The feature must preserve the current stability of:

- raw-like AI mode behavior
- pane focus behavior
- split-pane interactions
- copy/paste
- existing bypass text and mouse-driven voice input

## Problem

The current AI bypass voice flow is usable by mouse, but it still has a gap in keyboard-first operation:

1. The user must first open the bypass composer.
2. The user must then click the voice button.
3. The user must click again to stop.
4. Only then can the user press `Enter` to send.

This is workable, but too slow for “capture a sudden idea immediately” workflows.

The requested improvement is not a global dictation mode. It is a focused AI-mode shortcut that safely drives the existing bypass voice flow without destabilizing the rest of the terminal.

## Product Decision

Use the existing configurable terminal shortcut system and add a new action:

- `toggleAiVoiceBypass`

Its behavior is strictly scoped to the active AI pane.

Interaction rules:

- If the active pane is not AI mode, do nothing.
- If the active AI pane cannot accept input, do nothing.
- If speech is not configured, do nothing at the shortcut layer and let the existing UI explain configuration state.
- First shortcut press:
  - open the bypass composer
  - start voice capture immediately
- Second shortcut press while recording:
  - stop voice capture
- After transcription completes:
  - keep the bypass composer open
  - keep the transcript in the draft
  - let the user press `Enter` to send manually
- If voice capture is already complete and draft text is present:
  - pressing the shortcut again starts a new voice capture round and appends more text when complete
- If voice capture is currently finalizing:
  - ignore repeated shortcut presses

This keeps the shortcut simple and deterministic.

## Non-Goals

- Replacing the existing mouse voice button
- Creating a global system-wide push-to-talk layer
- Auto-sending the transcript when recording ends
- Extending the shortcut to non-AI panes
- Adding separate voice shortcut semantics for different AI providers
- Changing raw terminal key routing outside the existing workspace shortcut system

## Recommended Approach

Add one new configurable shortcut entry to the existing terminal shortcut model and route it through the same workspace shortcut infrastructure already used for split and focus actions.

Recommended layering:

1. Terminal shortcut config owns the new binding.
2. Workspace shortcut hook detects the binding and raises one semantic action.
3. The active pane surface decides whether the action applies.
4. `AiWorkflowSurface` maps that action into existing voice state transitions.

Why this is the right tradeoff:

- It reuses the most stable input path already in the app.
- It keeps shortcut conflict detection and persistence consistent.
- It avoids global key listeners dedicated to one feature.
- It keeps the voice state machine local to the AI bypass surface where it already exists.

Alternatives considered and rejected:

1. Hard-code a dedicated key listener only for AI bypass voice.
   Too easy to drift from the main shortcut system and create conflict bugs.

2. Reuse the normal bypass-open trigger and overload it with voice behavior.
   Too ambiguous. The same shortcut would mean different things in different UI states.

3. Add a separate “voice mode” subsystem above panes.
   Over-engineered and risky for terminal stability.

## Architecture

### 1. Shortcut Model

[terminal-shortcuts.ts](/home/zpc/projects/praw/src/domain/config/terminal-shortcuts.ts) should gain:

- `toggleAiVoiceBypass: ShortcutBinding | null`

This makes the feature:

- configurable
- serializable with the rest of terminal shortcuts
- covered by existing duplicate detection
- visible in the settings UI

Default binding should be conservative and low-conflict. The exact default can be chosen during implementation, but it must not collide with:

- split right
- split down
- edit note
- toggle focus pane

### 2. Workspace Shortcut Routing

The existing workspace shortcut path should remain the only keyboard entry point for this feature.

The hook layer should:

- detect the new shortcut
- stop propagation only when it matches
- dispatch one semantic action for the active pane

It should not:

- call Tauri voice APIs directly
- understand speech configuration
- inspect AI provider details

### 3. Pane-Level Ownership

`AiWorkflowSurface` should own the resulting behavior.

It already owns:

- bypass open state
- voice session state
- live transcript preview
- final transcript insertion

It should gain one more external trigger input, similar in shape to the existing bypass-open request key:

- a “voice bypass toggle request” signal

When this signal changes, `AiWorkflowSurface` should:

- open the bypass composer if needed
- start voice capture if idle
- stop voice capture if actively recording
- ignore the request if finalizing

### 4. Presentation Boundary

`AiModePromptOverlay` should not know about the shortcut itself.

It should continue to be driven entirely by props from `AiWorkflowSurface`.

This keeps the keyboard path and mouse path converging on the same local state machine rather than creating two partially duplicated implementations.

## State Machine

### Idle

Conditions:

- bypass composer may be closed or open
- no active voice session
- not finalizing

Shortcut behavior:

- open bypass composer
- start voice capture

### Recording

Conditions:

- active voice session exists
- not finalizing

Shortcut behavior:

- stop voice capture

### Finalizing

Conditions:

- stop has been sent
- final transcript not yet completed

Shortcut behavior:

- ignore repeated shortcut presses

Rationale:

- repeated stop requests add no value
- this avoids unstable double-stop behavior

### Ready To Send

Conditions:

- no active voice session
- transcript draft exists

Shortcut behavior:

- start a new voice capture round
- append new finalized text into the existing draft

Rationale:

- preserves the manual drafting model
- supports iterative voice entry without forcing send

## Trigger Conditions

The shortcut must only act when all of these are true:

- the app window is focused
- an active pane exists
- the active pane is AI mode
- the active AI session is running
- the pane supports the AI bypass surface

If speech is not configured:

- the semantic action may still open the bypass composer if that makes the failure clearer
- but it must not start a voice session
- the existing configuration message should remain the primary feedback path

The safer default is:

- open the bypass composer
- do not start voice
- surface the existing “Speech input is not configured.” status

This preserves discoverability without creating silent failure.

## Settings UI

The settings panel should expose the new shortcut beside the existing pane shortcuts.

Requirements:

- same capture UI as other shortcuts
- same conflict detection
- same persistence behavior
- localized label in English and Chinese

Suggested label:

- English: `Toggle AI Voice Bypass`
- Chinese: `切换 AI 语音旁路`

## Error Handling

If the shortcut fires in AI mode but speech is not configured:

- open the bypass composer
- keep the voice button disabled
- show existing configuration guidance

If the shortcut fires while recording and `stopVoiceTranscription(...)` fails:

- keep the draft intact
- keep existing error handling
- do not close the composer

If the active pane changes during recording:

- existing pane-local cleanup rules remain authoritative
- the shortcut should only target the currently active pane, never a stale pane id

## Testing Strategy

### Domain Tests

Update shortcut model tests to cover:

- new config key normalization
- duplicate detection with `toggleAiVoiceBypass`
- formatting and conflict reporting

### Settings Tests

Update settings panel tests to cover:

- rendering the new shortcut field
- updating the stored binding
- localized label presence

### Workspace Shortcut Tests

Add or update tests to verify:

- matching the new binding triggers the semantic action
- non-matching keys do not trigger it
- other shortcuts remain unaffected

### AI Surface Tests

Update `AiWorkflowSurface` tests to cover:

- shortcut request opens bypass and starts recording
- second shortcut request stops recording
- request during finalizing is ignored
- request when speech is unconfigured opens bypass but does not start recording
- request after one transcript round can start another round and append text

## Risks

1. If shortcut routing bypasses the existing workspace path, it may destabilize terminal key handling.
2. If the shortcut targets non-active panes, it could create cross-pane voice state bugs.
3. If finalizing is not guarded, repeated shortcut presses may produce duplicate stop requests.
4. If the shortcut path diverges from the mouse path, maintenance cost will rise quickly.

## Success Criteria

The feature is successful when:

- the user can bind a dedicated AI voice bypass shortcut
- pressing it in the active AI pane opens bypass and starts recording
- pressing it again stops recording
- the user can press `Enter` afterward to send manually
- existing split, focus, raw-like AI mode, and copy/paste behavior remain stable
- non-AI panes and non-matching contexts are unaffected
