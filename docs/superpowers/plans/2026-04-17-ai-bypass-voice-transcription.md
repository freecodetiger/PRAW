# AI Bypass Voice Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible, click-toggle voice recorder to the AI bypass composer, show live temporary transcription while recording, and insert only the finalized transcript into the bypass draft for manual send.

**Architecture:** Keep voice session ownership inside `AiWorkflowSurface`, keep `AiModePromptOverlay` presentation-only, and extend the existing Tauri voice bridge with one additional live-transcript event instead of inventing a second transport path. Partial realtime text stays in a separate preview buffer so the stable draft textarea and raw-like AI mode behavior remain untouched until final completion.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + jsdom, Tauri 2, Rust, tokio, tokio-tungstenite, cpal.

---

## File Structure

**Modify:**
- `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs` — add a live transcript event, emit intermediate text during `result-generated`, keep completed/failure behavior intact
- `/home/zpc/projects/praw/src/lib/tauri/voice.ts` — expose the new live transcript event and listener helper to the frontend
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx` — own click-toggle voice state, temporary transcript buffer, final insert, and cleanup
- `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx` — render the voice button in all expanded states, switch to click-toggle behavior, render live transcript preview and unconfigured status
- `/home/zpc/projects/praw/src/app/styles.css` — style the visible voice button, active/finalizing states, and live transcript preview region
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` — cover visible disabled button, click-toggle recording, live preview, final insert, and cancel behavior

**Create:**
- None

**Why this structure:**
- The Rust voice module already owns provider protocol mapping, so live transcript emission belongs there.
- The Tauri voice bridge remains the single frontend/native interface.
- `AiWorkflowSurface` already owns bypass draft and session lifecycle, so voice state stays local there.
- `AiModePromptOverlay` stays a presentational component with no transport knowledge.

### Task 1: Add a Dedicated Live Transcript Event to the Voice Bridge

**Files:**
- Modify: `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`
- Modify: `/home/zpc/projects/praw/src/lib/tauri/voice.ts`
- Test: `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`

- [ ] **Step 1: Write the failing Rust test for live transcript parsing**

Add a test next to the existing voice parsing tests:

```rust
#[test]
fn parses_live_result_generated_event_text() {
    let result = parse_server_event(
        r#"{
            "header": { "task_id": "session-1", "event": "result-generated" },
            "payload": {
                "output": {
                    "sentence": {
                        "text": "hello partial",
                        "sentence_end": false,
                        "heartbeat": false
                    }
                }
            }
        }"#,
    )
    .expect("result-generated payload should parse");

    match result {
        ServerMessage::ResultGenerated { text } => {
            assert_eq!(text.as_deref(), Some("hello partial"));
        }
        other => panic!("expected ResultGenerated, got {other:?}"),
    }
}
```

- [ ] **Step 2: Run the focused Rust test suite to verify current baseline**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml voice::tests::parses_live_result_generated_event_text -- --exact
```

Expected: FAIL because the new test does not exist yet, then after adding it PASS against current parser behavior.

- [ ] **Step 3: Add a new emitted live transcript event in Rust**

Extend the voice module with a dedicated event constant and payload struct:

```rust
pub const VOICE_TRANSCRIPTION_LIVE_EVENT: &str = "voice/transcription-live";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionLiveEvent {
    pub session_id: String,
    pub text: String,
}
```

Add an emitter helper:

```rust
fn emit_live(app: &AppHandle, session_id: &str, text: &str) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_LIVE_EVENT,
        VoiceTranscriptionLiveEvent {
            session_id: session_id.to_string(),
            text: text.to_string(),
        },
    );
}
```

Update the realtime loop so every non-empty `result-generated` payload updates both the last-final buffer and the live stream:

```rust
ServerMessage::ResultGenerated { text } => {
    if let Some(text) = text {
        final_text = text.clone();
        emit_live(&app, &session_id, &text);
    }
}
```

- [ ] **Step 4: Expose the new event in the TypeScript Tauri bridge**

Update `src/lib/tauri/voice.ts` with the new constant, payload type, and listener:

```ts
export const VOICE_TRANSCRIPTION_LIVE_EVENT = "voice/transcription-live";

export interface VoiceTranscriptionLiveEvent {
  sessionId: string;
  text: string;
}

export function onVoiceTranscriptionLive(
  handler: (event: VoiceTranscriptionLiveEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionLiveEvent>(VOICE_TRANSCRIPTION_LIVE_EVENT, (event) => handler(event.payload));
}
```

- [ ] **Step 5: Run Rust and frontend contract verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml voice::tests
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: Rust voice tests PASS; frontend test file may still FAIL because UI behavior is not implemented yet.

- [ ] **Step 6: Commit the backend/bridge contract change**

Run:

```bash
git add src-tauri/src/voice/mod.rs src/lib/tauri/voice.ts
git commit -m "feat: expose live voice transcription events"
```

### Task 2: Lock the New User Experience with Frontend Tests

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Test: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Replace the old hold-to-talk expectations with click-toggle tests**

Add or replace tests so they assert the new contract:

```ts
it("keeps the voice button visible but disabled when speech is not configured", () => {
  renderSurface(root, createAgentWorkflowPaneState(), {
    quickPromptOpenRequestKey: 1,
  });

  const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
  expect(voiceButton).not.toBeNull();
  expect(voiceButton?.disabled).toBe(true);
  expect(host.textContent).toContain("Speech input is not configured");
});

it("starts on first click, shows live transcript separately, and stops on second click", async () => {
  useAppConfigStore.getState().patchSpeechConfig({
    enabled: true,
    apiKey: "speech-key",
    language: "zh",
  });

  renderSurface(root, createAgentWorkflowPaneState(), {
    quickPromptOpenRequestKey: 1,
  });

  const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;
  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;

  await act(async () => {
    voiceButton?.click();
  });

  expect(voiceApi.startVoiceTranscription).toHaveBeenCalledWith({
    apiKey: "speech-key",
    language: "zh",
    provider: "aliyun-paraformer-realtime",
  });

  await act(async () => {
    voiceApi.emitStarted({ sessionId: "voice-session-1" });
    voiceApi.emitLive({ sessionId: "voice-session-1", text: "你好" });
  });

  expect(host.textContent).toContain("你好");
  expect(input?.value).toBe("");

  await act(async () => {
    voiceButton?.click();
  });

  expect(voiceApi.stopVoiceTranscription).toHaveBeenCalledWith("voice-session-1");

  await act(async () => {
    voiceApi.emitCompleted({ sessionId: "voice-session-1", text: "你好 codex" });
  });

  expect(input?.value).toBe("你好 codex");
});
```

Add a cancellation regression:

```ts
it("cancels active recording on escape and preserves any existing typed draft", async () => {
  useAppConfigStore.getState().patchSpeechConfig({
    enabled: true,
    apiKey: "speech-key",
    language: "auto",
  });

  renderSurface(root, createAgentWorkflowPaneState(), {
    quickPromptOpenRequestKey: 1,
  });

  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
  const voiceButton = host.querySelector('[aria-label="Toggle voice input"]') as HTMLButtonElement | null;

  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(input, "existing draft");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    voiceButton?.click();
  });

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(voiceApi.cancelVoiceTranscription).toHaveBeenCalledWith("voice-session-1");
  expect(input?.value).toBe("existing draft");
});
```

- [ ] **Step 2: Extend the test voice mock with a live transcript emitter**

Update the hoisted mock object so tests can drive the new event:

```ts
let liveHandler: ((event: { sessionId: string; text: string }) => void) | null = null;

onVoiceTranscriptionLive: vi.fn(async (handler) => {
  liveHandler = handler;
  return () => {
    liveHandler = null;
  };
}),

emitLive(payload: { sessionId: string; text: string }) {
  liveHandler?.(payload);
},
```

- [ ] **Step 3: Run the focused frontend test file and confirm it fails for the right reason**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: FAIL because the UI still hides the unconfigured button, still listens for mouse down/up, and does not render a live transcript region.

- [ ] **Step 4: Commit the red test suite**

Run:

```bash
git add src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "test: cover click-toggle AI bypass voice input"
```

### Task 3: Implement Click-Toggle Voice State in AiWorkflowSurface

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
- Test: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Subscribe to the live transcript event and add explicit voice state**

Refactor the component state so it can distinguish configuration, active recording, finalization, and live preview:

```ts
const voiceConfigured = speechConfig.enabled && speechConfig.apiKey.trim().length > 0;
const [liveTranscript, setLiveTranscript] = useState("");
const [isVoiceFinalizing, setIsVoiceFinalizing] = useState(false);
```

Add the new listener in the subscription effect:

```ts
cleanup.push(
  await onVoiceTranscriptionLive((event) => {
    if (event.sessionId !== voiceSessionIdRef.current) {
      return;
    }

    setLiveTranscript(event.text);
  }),
);
```

Clear `liveTranscript` whenever the session completes, fails, or is cancelled.

- [ ] **Step 2: Replace press-start/press-end handlers with a single toggle handler**

Implement the state machine with two entry points:

```ts
const startVoiceCapture = async () => {
  if (!voiceConfigured || composerDisabled || isBypassSubmitting || voiceSessionIdRef.current) {
    return;
  }

  setBypassError(null);
  setLiveTranscript("");
  setIsVoiceFinalizing(false);
  setVoiceStatus("Starting microphone…");

  try {
    const session = await startVoiceTranscription({
      provider: speechConfig.provider,
      apiKey: speechConfig.apiKey,
      language: speechConfig.language,
    });
    voiceSessionIdRef.current = session.sessionId;
    setVoiceSessionId(session.sessionId);
  } catch {
    resetVoiceState();
    setBypassError("Voice input could not start.");
  }
};

const stopVoiceCapture = async () => {
  const currentSessionId = voiceSessionIdRef.current;
  if (!currentSessionId || isVoiceFinalizing) {
    return;
  }

  setIsVoiceFinalizing(true);
  setVoiceStatus("Transcribing…");

  try {
    await stopVoiceTranscription(currentSessionId);
  } catch {
    setIsVoiceFinalizing(false);
    setBypassError("Voice input could not stop cleanly.");
  }
};

const toggleVoiceCapture = async () => {
  if (voiceSessionIdRef.current) {
    await stopVoiceCapture();
    return;
  }

  await startVoiceCapture();
};
```

- [ ] **Step 3: Cancel recording safely on escape/unmount without discarding typed text**

Update collapse and cleanup paths to preserve the draft while clearing only live voice state:

```ts
const resetVoiceState = () => {
  voiceSessionIdRef.current = null;
  setVoiceSessionId(null);
  setVoiceStatus(null);
  setLiveTranscript("");
  setIsVoiceFinalizing(false);
};

const cancelVoiceCapture = async () => {
  if (!voiceSessionIdRef.current) {
    return;
  }

  await cancelVoiceTranscription(voiceSessionIdRef.current);
  resetVoiceState();
};
```

Use `cancelVoiceCapture` from the effect cleanup and from the `Escape` path while recording.

- [ ] **Step 4: Insert only finalized text into the durable draft**

Keep the current completed-event append behavior, but clear the live preview and finalization flag explicitly:

```ts
await onVoiceTranscriptionCompleted((event) => {
  if (event.sessionId !== voiceSessionIdRef.current) {
    return;
  }

  const transcript = event.text.trim();
  if (transcript.length > 0) {
    setBypassDraft((current) => (current.trim().length > 0 ? `${current}\n${transcript}` : transcript));
  }

  resetVoiceState();
});
```

- [ ] **Step 5: Pass the new presentation props into the overlay**

Replace the old props with the new UI contract:

```tsx
<AiModePromptOverlay
  expanded={bypassPromptOpen}
  draft={bypassDraft}
  disabled={composerDisabled || isBypassSubmitting}
  error={bypassError}
  statusMessage={
    voiceStatus ?? (!voiceConfigured ? "Speech input is not configured." : composerDisabled ? "The AI session is not accepting input." : null)
  }
  voiceAvailable={true}
  voiceConfigured={voiceConfigured}
  voiceActive={voiceSessionId !== null && !isVoiceFinalizing}
  voicePendingFinal={isVoiceFinalizing}
  liveTranscript={liveTranscript}
  onChange={...}
  onCollapse={closeBypassPrompt}
  onSubmit={submitBypassPrompt}
  onVoiceToggle={toggleVoiceCapture}
  onVoiceCancel={cancelVoiceCapture}
/>
```

- [ ] **Step 6: Run the focused frontend test file and make it green**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS for the updated voice-interaction tests.

- [ ] **Step 7: Commit the state-machine implementation**

Run:

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: add click-toggle AI bypass voice capture"
```

### Task 4: Rebuild the Overlay UI for Visible, Clickable Voice Recording

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`
- Modify: `/home/zpc/projects/praw/src/app/styles.css`
- Test: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Update the overlay props to the new presentation contract**

Change the component signature to accept explicit configuration/finalization/live-preview props:

```ts
interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  voiceAvailable?: boolean;
  voiceConfigured?: boolean;
  voiceActive?: boolean;
  voicePendingFinal?: boolean;
  liveTranscript?: string;
  onChange: (value: string) => void;
  onCollapse: () => void;
  onSubmit: () => Promise<void> | void;
  onVoiceToggle?: () => Promise<void> | void;
  onVoiceCancel?: () => Promise<void> | void;
}
```

- [ ] **Step 2: Implement click-toggle button behavior and escape routing**

Replace the old mouse down/up control with a single button click:

```tsx
<button
  className={`button button--ghost ai-workflow__bypass-voice${voiceActive ? " ai-workflow__bypass-voice--active" : ""}${voicePendingFinal ? " ai-workflow__bypass-voice--pending" : ""}`}
  type="button"
  aria-label="Toggle voice input"
  disabled={disabled || voicePendingFinal || !voiceConfigured}
  onClick={() => {
    void onVoiceToggle?.();
  }}
>
  {voicePendingFinal ? "Transcribing…" : voiceActive ? "Stop" : "Mic"}
</button>
```

Update the textarea `Escape` handler:

```ts
if (event.key === "Escape") {
  event.preventDefault();
  event.stopPropagation();
  if (voiceActive || voicePendingFinal) {
    void onVoiceCancel?.();
    return;
  }
  onCollapse();
}
```

- [ ] **Step 3: Render a dedicated live transcript preview region**

Add a small preview block below the input row:

```tsx
{liveTranscript.trim().length > 0 ? (
  <div className="ai-workflow__bypass-live" aria-label="Live transcript preview">
    {liveTranscript}
  </div>
) : null}
```

- [ ] **Step 4: Style the new states without disturbing the stable bypass layout**

Add or update CSS blocks such as:

```css
.ai-workflow__bypass-voice--pending {
  opacity: 0.8;
  cursor: progress;
}

.ai-workflow__bypass-live {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ai-theme-color) 14%, var(--border-muted));
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 94%, var(--ai-background-color));
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}
```

Keep the composer width, position, and existing raw-like terminal layout untouched.

- [ ] **Step 5: Run the app style test and the surface interaction test together**

Run:

```bash
npm test -- src/app/styles.test.ts src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS after the overlay and CSS updates are aligned.

- [ ] **Step 6: Commit the overlay/UI update**

Run:

```bash
git add src/features/terminal/components/AiModePromptOverlay.tsx src/app/styles.css src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: show live AI bypass voice transcription UI"
```

### Task 5: Full Regression Verification and Packaging Confidence Check

**Files:**
- Modify: none
- Test: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`, `/home/zpc/projects/praw/src/app/styles.test.ts`, `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`

- [ ] **Step 1: Run the targeted verification set**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
cargo test --manifest-path src-tauri/Cargo.toml voice::tests
```

Expected: PASS with the new live transcript contract and UI behavior.

- [ ] **Step 2: Run the broader repo test suites**

Run:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS with no regressions in existing AI mode, config, or terminal behavior.

- [ ] **Step 3: Run the production desktop build**

Run:

```bash
npm run tauri build
```

Expected: PASS and produce updated Linux bundles under `src-tauri/target/release/bundle`.

- [ ] **Step 4: Commit the final verified feature set**

Run:

```bash
git add src-tauri/src/voice/mod.rs src/lib/tauri/voice.ts src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiModePromptOverlay.tsx src/app/styles.css src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: add live voice transcription to AI bypass composer"
```

## Self-Review

- Spec coverage: the plan covers discoverable visible button states, click-toggle interaction, realtime temporary transcript, final-only draft insertion, cancel/error handling, and regression verification.
- Placeholder scan: no `TODO`, `TBD`, or implicit “write tests later” steps remain.
- Type consistency: the plan consistently uses `voiceConfigured`, `voicePendingFinal`, `liveTranscript`, `onVoiceToggle`, and `onVoiceCancel` across Rust bridge, React state, and overlay props.
