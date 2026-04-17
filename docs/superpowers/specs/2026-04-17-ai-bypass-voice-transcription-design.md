# AI Bypass Voice Transcription Design

Date: 2026-04-17

## Goal

Add a usable voice input path to the AI mode bypass composer so the user can:

- open the bypass composer
- click a visible voice button to start recording
- see live temporary transcription while speaking
- click again to stop recording
- have the finalized transcript inserted into the bypass draft
- manually submit the prompt afterward

This must preserve the current stable raw-like AI mode, split-pane behavior, transcript copy/paste, and bypass text-entry flow.

## Problem

The current voice path exists in code but fails the actual product expectation in three ways:

1. The button is not visible unless speech is fully configured, so the feature looks absent instead of unavailable.
2. The interaction is press-and-hold, which is fragile on desktop and does not match the intended click-to-start / click-to-stop mental model.
3. There is no product-level separation between temporary live transcription and the final text that should be inserted into the draft.

The result is that the user cannot discover or trust the feature.

## Product Decision

Adopt a click-toggle voice recorder inside the expanded AI bypass composer.

Interaction rules:

- The voice button is shown whenever the bypass composer is expanded.
- If speech is not configured, the button remains visible in a disabled state with clear status text instead of disappearing.
- First click starts recording.
- While recording, the UI shows a live temporary transcript region.
- Second click stops recording and transitions to transcription finalization.
- Only the final transcript is written into the main bypass draft.
- The user still decides whether to send by pressing `Enter` or clicking the normal send path.
- Voice input never auto-sends.
- `Escape` while idle collapses the bypass composer as today.
- `Escape` during active recording cancels the voice session first, then keeps the composer open with existing text intact.

## Non-Goals

- Replacing the main CLI input path
- Auto-sending voice transcripts directly to the AI session
- Adding waveform visualization or audio meters
- Supporting providers beyond the existing Aliyun realtime path
- Changing pane splitting, transcript retention, raw terminal transport, or copy/paste architecture
- Adding global hotkey-based recording

## Recommended Approach

Keep the current Tauri voice transport and event stream, but change the UI contract around it.

Recommended shape:

1. `AiWorkflowSurface` remains the owner of voice session state.
2. `AiModePromptOverlay` becomes a click-toggle recorder surface, not a press-and-hold control.
3. Live `result-generated` text is surfaced as temporary transcript state.
4. Final completion inserts text into the draft only once the server marks the session complete.

Why this is the right tradeoff:

- It matches expected desktop interaction.
- It keeps the voice logic local to the existing AI bypass feature.
- It avoids writing unstable partial text into the real prompt.
- It requires no new backend provider abstraction.

Alternatives considered and rejected:

1. Continue with hold-to-talk.
   Too fragile for desktop mouse interaction and too easy to interrupt accidentally.

2. Write partial transcripts directly into the main textarea.
   This causes cursor jumps, unstable text replacement, and poor trust when realtime ASR revises earlier words.

3. Auto-send after transcription completes.
   Too risky for prompt quality and contradicts the bypass composer’s purpose as a drafting surface.

## Architecture

### 1. State Ownership

[AI workflow surface](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx) should continue to own all stateful behavior:

- voice session id
- voice lifecycle state
- temporary transcript text
- final draft insertion
- error/status text
- cancel/stop cleanup

This keeps the feature isolated to AI mode and avoids leaking voice state into global stores.

### 2. Presentation Boundary

[AI mode prompt overlay](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx) should become a purely presentational recorder UI.

It should receive props for:

- `voiceAvailable`
- `voiceConfigured`
- `voiceActive`
- `voicePendingFinal`
- `liveTranscript`
- `statusMessage`
- `onVoiceToggle`
- `onVoiceCancel`

It should not:

- call Tauri directly
- decide provider configuration
- own websocket or microphone state
- mutate the real prompt draft by itself

### 3. Tauri Voice Contract

The existing Tauri voice layer already exposes:

- `startVoiceTranscription(...)`
- `stopVoiceTranscription(...)`
- `cancelVoiceTranscription(...)`
- started/status/completed/failed events

The design should keep this contract and only extend frontend interpretation of status/result events.

If the backend already emits repeated `result-generated` events, those should be treated as live transcript updates. If the current Rust layer only stores the last final text, it should be adjusted to emit intermediate text updates without changing the provider protocol.

## Data Flow

### Start Recording

1. User opens the bypass composer.
2. User clicks the voice button.
3. Frontend validates speech configuration.
4. Frontend starts a voice session through Tauri.
5. UI enters `listening` state.
6. Live transcript region becomes visible.

### Realtime Transcription

1. Provider sends intermediate transcript messages.
2. Tauri forwards them to the frontend as live status/result updates.
3. Frontend updates a separate `liveTranscript` buffer.
4. Main textarea remains untouched during recording.

### Stop Recording

1. User clicks the same button again.
2. Frontend sends `stopVoiceTranscription(sessionId)`.
3. UI enters `finalizing` state.
4. Button is disabled or visually locked during finalization.

### Final Insert

1. Provider emits the completed transcript.
2. Frontend trims and normalizes it.
3. Transcript is inserted into the bypass draft:
   - append to existing draft with a newline if the draft is non-empty
   - replace empty draft if it is blank
4. Live transcript buffer clears.
5. Voice state resets to idle.

## UX Details

### Voice Button Visibility

The button should always be present when the bypass composer is expanded.

States:

- `disabled-unconfigured`: visible, not clickable, status says speech input is not configured
- `idle`: clickable, labeled `Mic`
- `listening`: clickable, labeled `Stop`, visually active
- `finalizing`: not clickable, labeled `Transcribing…`

This solves the current discoverability problem.

### Live Transcript Region

The live transcript should appear below the textarea, separate from the durable draft.

Rules:

- Use subdued styling distinct from the normal prompt text.
- Allow text to update in place as the ASR revises itself.
- Clear it on cancel, completion, or failure.
- Do not mix it into error text.

### Error Handling

If voice configuration is missing:

- button stays visible but disabled
- status text explains what is missing

If start fails:

- show `Voice input could not start.`
- return to idle

If stop fails:

- keep current transcript preview if available
- surface `Voice input could not stop cleanly.`
- allow retry or cancel

If provider fails:

- clear session state
- preserve the existing typed draft
- clear the live transcript preview
- show provider error text

## Testing Strategy

### Frontend Tests

Update [AI workflow surface tests](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx) to cover:

- voice button visible when expanded but unconfigured
- disabled state copy when speech config is missing
- click once starts recording
- click again stops recording
- live transcript preview updates without mutating the textarea
- completed transcript inserts into the textarea
- cancel clears live transcript without deleting existing draft

### Backend Tests

Update [voice module tests](/home/zpc/projects/praw/src-tauri/src/voice/mod.rs) only if needed to cover any new intermediate transcript event mapping.

### Regression Targets

Do not regress:

- bypass submit with `Enter`
- `Escape` collapse behavior when draft is empty
- draft preservation on failed submit
- current raw-like AI mode rendering
- split-pane stability

## Implementation Notes

Likely frontend files:

- [AiWorkflowSurface.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx)
- [AiModePromptOverlay.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx)
- [AiWorkflowSurface.test.tsx](/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx)
- [styles.css](/home/zpc/projects/praw/src/app/styles.css)

Possible backend file if intermediate transcript forwarding is missing:

- [voice/mod.rs](/home/zpc/projects/praw/src-tauri/src/voice/mod.rs)

## Risks

1. Realtime ASR may revise text frequently, so partials must stay out of the main draft until completion.
2. Session cleanup must remain robust if the pane unmounts during active recording.
3. The new UI must not interfere with the stable bypass composer submit path.
4. The feature must degrade clearly when speech config is absent instead of silently disappearing.

## Success Criteria

The feature is successful when:

- the user can always discover the voice entry point in the expanded bypass composer
- a single click starts recording
- a second click stops recording
- live transcript feedback is visible while recording
- only finalized text is inserted into the draft
- the user can still review and manually send the prompt
- no regressions appear in AI mode pane stability or existing bypass behavior