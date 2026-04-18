# Speech Recognition Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in speech recognition preset system with `default` and `programmer` modes, wire it through config and realtime transcription, and improve developer-oriented recognition with technical vocabulary normalization.

**Architecture:** Extend the existing speech config with a preset enum, forward it from the frontend to Tauri, and keep all provider-specific branching inside the Rust voice module. Implement preset data and transcript normalization as isolated, testable helpers so the current recording UX and raw-like AI mode remain untouched.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri 2, Rust, serde, tokio-tungstenite, Aliyun Paraformer realtime.

---

## File Structure

**Create:**
- `/home/zpc/projects/praw/src/domain/config/speech-preset.ts` — frontend speech preset type guard and option metadata
- `/home/zpc/projects/praw/src-tauri/src/voice/preset.rs` — preset enum, provider adaptation metadata, and built-in programmer vocabulary
- `/home/zpc/projects/praw/src-tauri/src/voice/normalize.rs` — deterministic transcript normalization helpers and tests

**Modify:**
- `/home/zpc/projects/praw/src/domain/config/types.ts` — add `SpeechPreset`
- `/home/zpc/projects/praw/src/domain/config/model.ts` — normalize `speech.preset`
- `/home/zpc/projects/praw/src/domain/config/model.test.ts` — cover preset defaults and fallback behavior
- `/home/zpc/projects/praw/src/features/config/state/app-config-store.test.ts` — verify speech preset patching
- `/home/zpc/projects/praw/src/features/config/lib/settings-panel-copy.ts` — add copy for preset selector
- `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.tsx` — render preset selector
- `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.test.tsx` — verify preset selector behavior
- `/home/zpc/projects/praw/src/lib/tauri/voice.ts` — add `preset` to `StartVoiceTranscriptionRequest`
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx` — forward preset when starting voice transcription
- `/home/zpc/projects/praw/src-tauri/src/config/mod.rs` — persist and default the speech preset in Rust config
- `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs` — accept preset on start, build provider request from preset, normalize live/final transcripts

**Why this structure:**
- frontend config files already own persisted shape and normalization
- settings UI already owns speech controls
- the Rust voice module should remain the only place that understands the realtime provider protocol
- preset metadata and transcript normalization need separate files so `mod.rs` does not become harder to reason about

### Task 1: Add Speech Preset to Frontend Config

**Files:**
- Create: `/home/zpc/projects/praw/src/domain/config/speech-preset.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/types.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/model.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/model.test.ts`

- [ ] **Step 1: Write the failing frontend config tests**

Add coverage to `src/domain/config/model.test.ts`:

```ts
it("defaults speech preset to general mode", () => {
  expect(DEFAULT_APP_CONFIG.speech.preset).toBe("default");
});

it("normalizes supported speech presets and falls back for invalid values", () => {
  expect(
    resolveAppConfig({
      speech: {
        enabled: true,
        provider: "aliyun-paraformer-realtime",
        apiKey: "speech-key",
        language: "auto",
        preset: "programmer",
      },
    }).speech.preset,
  ).toBe("programmer");

  expect(
    resolveAppConfig({
      speech: {
        preset: "writer",
      },
    }).speech.preset,
  ).toBe("default");
});
```

- [ ] **Step 2: Run the config tests to confirm the new assertion fails**

Run:

```bash
npm test -- src/domain/config/model.test.ts
```

Expected: FAIL because `preset` is not defined on speech config yet.

- [ ] **Step 3: Add the preset type and normalization helpers**

Create `src/domain/config/speech-preset.ts`:

```ts
export type SpeechPreset = "default" | "programmer";

export const SPEECH_PRESET_OPTIONS = [
  { value: "default", labelKey: "general" },
  { value: "programmer", labelKey: "programmer" },
] as const;

export function isSpeechPreset(value: string): value is SpeechPreset {
  return value === "default" || value === "programmer";
}
```

Update `src/domain/config/types.ts`:

```ts
export type SpeechLanguage = "auto" | "zh" | "en";
export type SpeechPreset = "default" | "programmer";

export interface SpeechConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  language: SpeechLanguage;
  preset: SpeechPreset;
}
```

Update `src/domain/config/model.ts`:

```ts
import { isSpeechPreset } from "./speech-preset";

speech: {
  enabled: typeof speech?.enabled === "boolean" ? speech.enabled : DEFAULT_APP_CONFIG.speech.enabled,
  provider: normalizeSpeechProvider(speech?.provider),
  apiKey: normalizeOptionalString(speech?.apiKey),
  language: normalizeSpeechLanguage(speech?.language),
  preset: normalizeSpeechPreset(speech?.preset),
},

function normalizeSpeechPreset(value: string | undefined): SpeechPreset {
  const normalized = normalizeOptionalString(value).toLowerCase();
  return isSpeechPreset(normalized) ? normalized : DEFAULT_APP_CONFIG.speech.preset;
}
```

Also update `DEFAULT_APP_CONFIG`:

```ts
speech: {
  enabled: false,
  provider: "aliyun-paraformer-realtime",
  apiKey: "",
  language: "auto",
  preset: "default",
},
```

- [ ] **Step 4: Re-run the config tests**

Run:

```bash
npm test -- src/domain/config/model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the frontend config changes**

Run:

```bash
git add src/domain/config/speech-preset.ts src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts
git commit -m "feat: add speech recognition presets to config"
```

### Task 2: Expose the Preset in Settings and Store Flow

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/config/state/app-config-store.test.ts`
- Modify: `/home/zpc/projects/praw/src/features/config/lib/settings-panel-copy.ts`
- Modify: `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.tsx`
- Modify: `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.test.tsx`

- [ ] **Step 1: Write failing UI and store tests**

Add a store regression:

```ts
it("patches speech preset without disturbing other speech settings", () => {
  useAppConfigStore.getState().patchSpeechConfig({
    preset: "programmer",
  });

  expect(useAppConfigStore.getState().config.speech).toEqual({
    ...DEFAULT_APP_CONFIG.speech,
    preset: "programmer",
  });
});
```

Add a settings-panel interaction test:

```ts
it("renders the speech preset selector and updates the stored preset", async () => {
  render(<SettingsPanel />);

  const presetSelect = screen.getByLabelText(/speech mode|识别模式/i);

  await userEvent.selectOptions(presetSelect, "programmer");

  expect(useAppConfigStore.getState().config.speech.preset).toBe("programmer");
});
```

- [ ] **Step 2: Run the focused frontend tests**

Run:

```bash
npm test -- src/features/config/state/app-config-store.test.ts src/features/config/components/SettingsPanel.test.tsx
```

Expected: FAIL because the preset field and selector are not wired yet.

- [ ] **Step 3: Add bilingual copy and selector UI**

Update `src/features/config/lib/settings-panel-copy.ts` with new copy keys:

```ts
speech: {
  // existing keys...
  preset: "Speech mode",
  presetOptions: {
    default: "General",
    programmer: "Programmer",
  },
  presetSummary: "Programmer mode improves recognition for technical terms, commands, and mixed Chinese-English developer speech.",
}
```

Render the selector in `src/features/config/components/SettingsPanel.tsx` next to the speech language control:

```tsx
<label className="settings-panel__field">
  <span>{copy.speech.preset}</span>
  <select
    value={config.speech.preset}
    onChange={(event) => patchSpeechConfig({ preset: event.target.value as typeof config.speech.preset })}
  >
    <option value="default">{copy.speech.presetOptions.default}</option>
    <option value="programmer">{copy.speech.presetOptions.programmer}</option>
  </select>
</label>
<p className="settings-panel__summary">{copy.speech.presetSummary}</p>
```

- [ ] **Step 4: Re-run the settings and store tests**

Run:

```bash
npm test -- src/features/config/state/app-config-store.test.ts src/features/config/components/SettingsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the settings changes**

Run:

```bash
git add src/features/config/state/app-config-store.test.ts src/features/config/lib/settings-panel-copy.ts src/features/config/components/SettingsPanel.tsx src/features/config/components/SettingsPanel.test.tsx
git commit -m "feat: add speech preset selection in settings"
```

### Task 3: Persist the Preset Through the Tauri Config Boundary

**Files:**
- Modify: `/home/zpc/projects/praw/src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write the failing Rust config tests**

Add assertions alongside the existing speech config tests:

```rust
#[test]
fn speech_config_defaults_to_default_preset() {
    let config = AppConfig::default();
    assert_eq!(config.speech.preset, "default");
}

#[test]
fn deserializes_speech_preset_from_json() {
    let config = serde_json::from_str::<AppConfig>(
        r#"{
            "terminal": { "defaultShell": "/bin/bash", "defaultCwd": "~" },
            "ai": {
                "provider": "",
                "model": "",
                "enabled": false,
                "apiKey": "",
                "themeColor": "#1f5eff",
                "backgroundColor": "#eef4ff"
            },
            "speech": {
                "enabled": true,
                "provider": "aliyun-paraformer-realtime",
                "apiKey": "speech-key",
                "language": "auto",
                "preset": "programmer"
            }
        }"#,
    )
    .expect("config should deserialize speech preset");

    assert_eq!(config.speech.preset, "programmer");
}
```

- [ ] **Step 2: Run the focused Rust config tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config::tests::speech_config_defaults_to_default_preset config::tests::deserializes_speech_preset_from_json
```

Expected: FAIL because `SpeechConfig` has no `preset` field yet.

- [ ] **Step 3: Add the persisted Rust config field**

Update `src-tauri/src/config/mod.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_speech_provider")]
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_speech_language")]
    pub language: String,
    #[serde(default = "default_speech_preset")]
    pub preset: String,
}

fn default_speech_preset() -> String {
    "default".to_string()
}
```

Update `impl Default for SpeechConfig`:

```rust
preset: default_speech_preset(),
```

Also extend any JSON serialization assertions that inspect `speech` fields.

- [ ] **Step 4: Re-run Rust config tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config::tests
```

Expected: PASS.

- [ ] **Step 5: Commit the Rust config change**

Run:

```bash
git add src-tauri/src/config/mod.rs
git commit -m "feat: persist speech preset in tauri config"
```

### Task 4: Add Preset-Aware Voice Request and Normalization Helpers

**Files:**
- Create: `/home/zpc/projects/praw/src-tauri/src/voice/preset.rs`
- Create: `/home/zpc/projects/praw/src-tauri/src/voice/normalize.rs`
- Modify: `/home/zpc/projects/praw/src/lib/tauri/voice.ts`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `/home/zpc/projects/praw/src-tauri/src/voice/mod.rs`

- [ ] **Step 1: Write failing tests for preset-aware normalization**

Add Rust unit tests to `src-tauri/src/voice/normalize.rs`:

```rust
#[test]
fn keeps_default_preset_as_identity() {
    assert_eq!(normalize_transcript("react 项目", SpeechPreset::Default), "react 项目");
}

#[test]
fn normalizes_programmer_terms_and_spaced_commands() {
    assert_eq!(
        normalize_transcript("用 typescript 写一个 react hook 然后运行 p n p m dev", SpeechPreset::Programmer),
        "用 TypeScript 写一个 React hook 然后运行 pnpm dev"
    );
}

#[test]
fn normalizes_common_chinese_tool_transliterations() {
    assert_eq!(
        normalize_transcript("在陶瑞里面修一下克劳德和扣代克斯", SpeechPreset::Programmer),
        "在 Tauri 里面修一下 Claude 和 Codex"
    );
}
```

- [ ] **Step 2: Run the failing normalization tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml voice::normalize::tests
```

Expected: FAIL because the new files and helpers do not exist yet.

- [ ] **Step 3: Implement preset metadata and normalizer modules**

Create `src-tauri/src/voice/preset.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpeechPreset {
    Default,
    Programmer,
}

impl SpeechPreset {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "programmer" => Self::Programmer,
            _ => Self::Default,
        }
    }

    pub fn vocabulary_id(self) -> Option<&'static str> {
        match self {
            Self::Default => None,
            Self::Programmer => None,
        }
    }
}
```

Create `src-tauri/src/voice/normalize.rs`:

```rust
use super::preset::SpeechPreset;

pub fn normalize_transcript(input: &str, preset: SpeechPreset) -> String {
    if preset == SpeechPreset::Default {
        return input.to_string();
    }

    let replacements = [
        ("typescript", "TypeScript"),
        ("react", "React"),
        ("node js", "Node.js"),
        ("git hub", "GitHub"),
        ("web socket", "WebSocket"),
        ("p n p m", "pnpm"),
        ("n p m", "npm"),
        ("陶瑞", "Tauri"),
        ("克劳德", "Claude"),
        ("扣代克斯", "Codex"),
    ];

    replacements
        .iter()
        .fold(input.to_string(), |text, (from, to)| text.replace(from, to))
}
```

Wire the new preset field into `src/lib/tauri/voice.ts`:

```ts
export interface StartVoiceTranscriptionRequest {
  provider: string;
  apiKey: string;
  language: "auto" | "zh" | "en";
  preset: "default" | "programmer";
}
```

Forward the preset from `AiWorkflowSurface.tsx`:

```ts
await startVoiceTranscription({
  provider: speechConfig.provider,
  apiKey: speechConfig.apiKey,
  language: speechConfig.language,
  preset: speechConfig.preset,
});
```

- [ ] **Step 4: Apply preset handling inside the voice session**

Update `src-tauri/src/voice/mod.rs` to parse and use the preset:

```rust
mod normalize;
mod preset;

use normalize::normalize_transcript;
use preset::SpeechPreset;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceTranscriptionRequest {
    pub provider: String,
    pub api_key: String,
    pub language: String,
    pub preset: String,
}
```

Inside session startup:

```rust
let preset = SpeechPreset::parse(&request.preset);
```

Before emitting live text:

```rust
let normalized = normalize_transcript(&text, preset);
emit_live(&app, &session_id, &normalized);
```

Before emitting completed text:

```rust
let normalized = normalize_transcript(&final_text, preset);
emit_completed(&app, &session_id, &normalized);
```

When building the provider request payload, keep the vocabulary hook explicit:

```rust
if let Some(vocabulary_id) = preset.vocabulary_id() {
    payload["parameters"]["vocabulary_id"] = json!(vocabulary_id);
}
```

- [ ] **Step 5: Run the voice-related tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml voice::tests voice::normalize::tests
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: Rust tests PASS; frontend may still need test updates if the request payload assertion now requires `preset`.

- [ ] **Step 6: Commit the preset-aware voice pipeline**

Run:

```bash
git add src-tauri/src/voice/preset.rs src-tauri/src/voice/normalize.rs src-tauri/src/voice/mod.rs src/lib/tauri/voice.ts src/features/terminal/components/AiWorkflowSurface.tsx
git commit -m "feat: add programmer speech recognition preset"
```

### Task 5: Add Frontend Regression Coverage for Preset Forwarding

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Add the failing payload assertion**

Update the voice-start expectation:

```ts
expect(voiceApi.startVoiceTranscription).toHaveBeenCalledWith({
  provider: "aliyun-paraformer-realtime",
  apiKey: "speech-key",
  language: "zh",
  preset: "programmer",
});
```

Use a config setup that includes the preset:

```ts
useAppConfigStore.getState().patchSpeechConfig({
  enabled: true,
  apiKey: "speech-key",
  language: "zh",
  preset: "programmer",
});
```

- [ ] **Step 2: Run the focused AI workflow tests**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: FAIL if the preset is not forwarded everywhere.

- [ ] **Step 3: Update the test fixtures and mocks**

Ensure the mocked request type and default app config fixture include `preset`:

```ts
speech: {
  enabled: false,
  provider: "aliyun-paraformer-realtime",
  apiKey: "",
  language: "auto",
  preset: "default",
},
```

Update every relevant start-call assertion to include `preset`.

- [ ] **Step 4: Re-run the AI workflow tests**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the regression coverage**

Run:

```bash
git add src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "test: cover speech preset forwarding"
```

### Task 6: Full Verification and Manual QA

**Files:**
- Modify: none

- [ ] **Step 1: Run the full targeted automated suite**

Run:

```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/features/config/components/SettingsPanel.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml config::tests voice::tests voice::normalize::tests
```

Expected: PASS.

- [ ] **Step 2: Run the application manually**

Run:

```bash
npm run tauri dev
```

Manual checklist:

- open settings and verify `Speech mode` selector is visible
- choose `Programmer`
- start voice input from the bypass composer
- speak a mixed phrase such as `用 typescript 写一个 react 组件，然后运行 p n p m dev`
- confirm the live preview is normalized reasonably
- stop recording and confirm the final inserted transcript preserves technical terms
- switch back to `General` and verify transcription still works without programmer-specific rewrites

- [ ] **Step 3: Inspect persisted config output**

Run:

```bash
rg -n '"speech"' ~/.config -g'*.json'
```

Expected: the app config now contains `"preset":"default"` or `"preset":"programmer"` under `speech`.

- [ ] **Step 4: Commit final verification notes if code changed during QA**

Run:

```bash
git status --short
```

Expected: clean working tree. If not clean due to follow-up fixes, commit them with a focused message before merging.
