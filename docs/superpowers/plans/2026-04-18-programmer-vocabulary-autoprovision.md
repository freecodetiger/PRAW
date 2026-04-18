# Programmer Vocabulary Auto-Provision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create and cache a per-user programmer hotword vocabulary when programmer speech mode is used, so distributed users can benefit from cloud hotword enhancement with their own Aliyun API keys.

**Architecture:** Extend speech config with cached programmer vocabulary state, move the built-in programmer hotword list into a dedicated Rust module, and add a provisioning helper in the Rust voice layer that creates the vocabulary on first use and falls back to local normalization when provisioning fails.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri 2, Rust, serde, reqwest, tokio-tungstenite, Aliyun DashScope realtime ASR customization API.

---

## File Structure

**Create:**
- `/home/zpc/projects/praw/src-tauri/src/voice/vocabulary.rs` — built-in programmer hotword entries and Aliyun customization request payload assembly

**Modify:**
- `/home/zpc/projects/praw/src/domain/config/types.ts` — add speech vocabulary cache fields
- `/home/zpc/projects/praw/src/domain/config/model.ts` — normalize the new speech vocabulary fields
- `/home/zpc/projects/praw/src/domain/config/model.test.ts` — cover defaults and normalization
- `/home/zpc/projects/praw/src/features/config/state/app-config-store.test.ts` — preserve new speech fields during patching
- `/home/zpc/projects/praw/src-tauri/src/config/mod.rs` — persist vocabulary cache fields in Rust config
- `/home/zpc/projects/praw/src-tauri/src/voice/preset.rs` — stop hard-coding a shared remote vocabulary id
- `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs` — auto-provision programmer vocabulary on first use, persist it, emit warning status on failure
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` — verify warning fallback behavior if surfaced through status events

**Why this structure:**
- config fields belong in the existing shared config layer
- vocabulary content and Aliyun create payload construction should live outside `voice/mod.rs`
- the voice module should orchestrate provisioning, not embed a giant static list

### Task 1: Extend Shared Speech Config with Vocabulary Cache State

**Files:**
- Modify: `/home/zpc/projects/praw/src/domain/config/types.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/model.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/model.test.ts`

- [ ] **Step 1: Write failing frontend config tests**

Add tests:

```ts
it("defaults programmer vocabulary cache fields safely", () => {
  expect(DEFAULT_APP_CONFIG.speech.programmerVocabularyId).toBe("");
  expect(DEFAULT_APP_CONFIG.speech.programmerVocabularyStatus).toBe("idle");
  expect(DEFAULT_APP_CONFIG.speech.programmerVocabularyError).toBe("");
});

it("normalizes programmer vocabulary cache fields", () => {
  expect(
    resolveAppConfig({
      speech: {
        programmerVocabularyId: " vocab-123 ",
        programmerVocabularyStatus: "ready" as never,
        programmerVocabularyError: " temporary error ",
      },
    }).speech,
  ).toMatchObject({
    programmerVocabularyId: "vocab-123",
    programmerVocabularyStatus: "ready",
    programmerVocabularyError: "temporary error",
  });
});
```

- [ ] **Step 2: Run the frontend config tests**

Run:

```bash
npm test -- src/domain/config/model.test.ts
```

Expected: FAIL because the new fields do not exist yet.

- [ ] **Step 3: Add the new speech config fields and normalizers**

Update `types.ts`:

```ts
export type SpeechVocabularyStatus = "idle" | "creating" | "ready" | "failed";

export interface SpeechConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  language: SpeechLanguage;
  preset: SpeechPreset;
  programmerVocabularyId: string;
  programmerVocabularyStatus: SpeechVocabularyStatus;
  programmerVocabularyError: string;
}
```

Update `model.ts` defaults and normalization:

```ts
speech: {
  enabled: false,
  provider: "aliyun-paraformer-realtime",
  apiKey: "",
  language: "auto",
  preset: "default",
  programmerVocabularyId: "",
  programmerVocabularyStatus: "idle",
  programmerVocabularyError: "",
},
```

Add normalization helpers for the status enum and strings.

- [ ] **Step 4: Re-run the frontend config tests**

Run:

```bash
npm test -- src/domain/config/model.test.ts
```

Expected: PASS.

### Task 2: Persist Vocabulary Cache Fields Through Store and Rust Config

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/config/state/app-config-store.test.ts`
- Modify: `/home/zpc/projects/praw/src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write failing store and Rust config tests**

Add store regression:

```ts
it("preserves programmer vocabulary cache fields when patching speech config", () => {
  useAppConfigStore.getState().patchSpeechConfig({
    programmerVocabularyId: "vocab-123",
    programmerVocabularyStatus: "ready",
    programmerVocabularyError: "",
  });

  expect(useAppConfigStore.getState().config.speech.programmerVocabularyId).toBe("vocab-123");
});
```

Add Rust config assertions:

```rust
#[test]
fn speech_config_defaults_vocabulary_cache_state() {
    let config = AppConfig::default();
    assert_eq!(config.speech.programmer_vocabulary_id, "");
    assert_eq!(config.speech.programmer_vocabulary_status, "idle");
    assert_eq!(config.speech.programmer_vocabulary_error, "");
}
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
npm test -- src/features/config/state/app-config-store.test.ts
cargo test --manifest-path src-tauri/Cargo.toml vocabulary_cache_state
```

Expected: FAIL because the new Rust fields do not exist yet.

- [ ] **Step 3: Add the Rust config fields**

Update `src-tauri/src/config/mod.rs`:

```rust
#[serde(default)]
pub programmer_vocabulary_id: String,
#[serde(default = "default_programmer_vocabulary_status")]
pub programmer_vocabulary_status: String,
#[serde(default)]
pub programmer_vocabulary_error: String,
```

Add defaults in `impl Default for SpeechConfig`.

- [ ] **Step 4: Re-run store and Rust config tests**

Run:

```bash
npm test -- src/features/config/state/app-config-store.test.ts
cargo test --manifest-path src-tauri/Cargo.toml vocabulary_cache_state
```

Expected: PASS.

### Task 3: Add Built-In Programmer Vocabulary Payload Module

**Files:**
- Create: `/home/zpc/projects/praw/src-tauri/src/voice/vocabulary.rs`
- Modify: `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`

- [ ] **Step 1: Write failing Rust tests for payload assembly**

Add tests that expect:

```rust
#[test]
fn programmer_vocabulary_create_payload_targets_realtime_v2() {
    let payload = vocabulary::build_programmer_vocabulary_create_payload("progx-auto");
    assert_eq!(payload["model"].as_str(), Some("speech-biasing"));
    assert_eq!(payload["input"]["action"].as_str(), Some("create_vocabulary"));
    assert_eq!(payload["input"]["target_model"].as_str(), Some("paraformer-realtime-v2"));
}
```

- [ ] **Step 2: Run the focused Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml programmer_vocabulary_create_payload
```

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement vocabulary payload builder**

Create a module that returns the JSON payload for the built-in programmer list. Keep the hotword entries centralized here.

- [ ] **Step 4: Re-run the focused Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml programmer_vocabulary_create_payload
```

Expected: PASS.

### Task 4: Auto-Provision Programmer Vocabulary in the Voice Layer

**Files:**
- Modify: `/home/zpc/projects/praw/src-tauri/src/voice/preset.rs`
- Modify: `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`

- [ ] **Step 1: Write failing voice tests for provisioning behavior**

Add tests for:

```rust
#[test]
fn programmer_run_task_without_cached_vocabulary_does_not_require_hard_coded_id() {
    assert_eq!(SpeechPreset::Programmer.vocabulary_id(), None);
}
```

Add a provisioning helper unit test that simulates:

- cached id exists → returns cached id
- no cached id + create success → returns new id
- no cached id + create failure → returns none

- [ ] **Step 2: Run the focused voice tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml programmer_run_task
```

Expected: FAIL because the preset still assumes a shared id or provisioning helper is missing.

- [ ] **Step 3: Implement non-blocking provisioning**

Update the preset module to remove the shared hard-coded id.

In `voice/mod.rs`, add a helper like:

```rust
async fn ensure_programmer_vocabulary(
    app: &AppHandle,
    api_key: &str,
) -> Option<String>
```

Responsibilities:

- read current config
- return cached id if present
- emit `Preparing programmer vocabulary…`
- call customization API with `reqwest`
- parse returned `vocabulary_id`
- persist id/status/error in config
- on failure, emit warning status and return `None`

- [ ] **Step 4: Re-run the voice tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

### Task 5: Surface Non-Blocking Warning Behavior in Frontend Tests

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Add a frontend regression test for warning status text**

Add a test that feeds a status event like:

```ts
voiceApi.emitStatus({
  sessionId: "voice-session-1",
  message: "Programmer cloud vocabulary unavailable. Using local enhancement instead.",
});
```

and verifies the surface shows the warning while remaining interactive.

- [ ] **Step 2: Run the focused frontend test**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS if the existing status UI already handles it, or FAIL if an adjustment is needed.

- [ ] **Step 3: Make the minimal UI adjustment if required**

Only adjust UI code if the existing status path does not surface the warning consistently.

- [ ] **Step 4: Re-run the focused frontend test**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

### Task 6: Full Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run targeted frontend tests**

Run:

```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/features/config/components/SettingsPanel.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 3: Manual behavior check**

Run:

```bash
npm run tauri dev
```

Manual checklist:

- set a fresh Aliyun API key
- switch speech mode to `Programmer`
- start voice input for the first time
- observe initialization status text
- confirm later starts do not require a fresh create request
- simulate or inspect failure path and confirm local enhancement still works
