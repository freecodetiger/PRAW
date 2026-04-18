# Speech Recognition Presets Design

Date: 2026-04-18

## Goal

Add a stable, extensible speech recognition preset layer so the app can optimize voice transcription for different speaking domains without changing the existing recording interaction.

The first preset is `programmer`, focused on computer-science and developer speech with technical vocabulary, CLI commands, framework names, and Chinese-English mixed utterances.

## Problem

The current voice pipeline is intentionally minimal:

- frontend config only stores `enabled`, `provider`, `apiKey`, and `language`
- the Tauri request only forwards provider, key, and language
- the realtime backend sends raw transcription text with no domain adaptation

This produces acceptable general speech transcription but weak results for developer-oriented dictation. Typical errors include:

- framework and language names not normalized to their standard spelling
- CLI words split into letter-by-letter fragments
- Chinese transliterations of tool names not mapped back to canonical English names
- mixed Chinese and English technical speech losing accuracy

## Product Decision

Introduce a new configuration concept: `speech preset`.

Initial supported values:

- `default`: current general-purpose behavior
- `programmer`: technical vocabulary enhanced behavior

This is a recognition strategy selector, not a chat personality system. It changes how speech is recognized and normalized, but does not affect model responses or AI persona.

## Non-Goals

- user-editable phrase managers in the first version
- arbitrary custom preset creation in the first version
- LLM-based transcript rewriting
- replacing the current realtime provider
- changing the existing bypass voice recording interaction
- automatic prompt sending after transcription

## Recommended Approach

Use a two-layer enhancement path for `programmer`:

1. Cloud adaptation
   Use Aliyun realtime ASR hotword or phrase-list support when available for technical terms.

2. Local post-processing
   Run a deterministic correction pass on both live and completed transcripts so standard technical spellings are restored even when the provider returns approximate phonetics or whitespace-separated fragments.

This is the best tradeoff between effect, latency, and maintainability.

## Alternatives Considered

### 1. Local correction only

Pros:

- simplest implementation
- no dependence on remote vocabulary configuration

Cons:

- cannot recover many mistakes if the recognizer chooses the wrong token entirely
- weaker improvement for mixed-language technical speech

### 2. Cloud hotwords only

Pros:

- recognition is improved at the source
- low local logic complexity

Cons:

- still leaves formatting and normalization gaps
- provider support details may differ between realtime modes
- offers no fallback if the vocabulary is unavailable or misconfigured

### 3. Cloud hotwords plus local normalization

Pros:

- strongest practical improvement
- graceful fallback if remote vocabulary support is partial
- deterministic and testable behavior

Cons:

- slightly more implementation work

Recommendation: use option 3.

## Architecture

### 1. Config Layer

Extend speech config with a new field:

- `preset: "default" | "programmer"`

This field must exist in:

- frontend config types
- frontend config normalization
- frontend config persistence
- Tauri config serialization and deserialization

Default value remains conservative:

- new installs default to `default`
- existing configs without `preset` continue to work

### 2. Frontend Request Layer

When the frontend starts a voice session, it must send the selected preset together with:

- provider
- api key
- language

The bypass UI does not need new runtime state beyond exposing the active preset in settings and forwarding it during session start.

### 3. Backend Voice Session Layer

The Rust voice module remains the owner of provider protocol integration.

It should branch on preset in exactly two places:

- request payload assembly
- transcript post-processing before emitting frontend events

This keeps provider-specific behavior in one module boundary.

### 4. Speech Preset Data Layer

Do not scatter hard-coded technical words across the voice loop.

Create explicit preset data structures for:

- canonical technical terms
- alias and misrecognition mappings
- optional cloud vocabulary identifiers or inline hotword lists

This should be data-driven so future presets can reuse the same pipeline.

### 5. Transcript Normalization Layer

Introduce a pure transformation stage:

- input: raw provider transcript text plus preset
- output: normalized transcript text

For `default`, this function should be effectively identity behavior.

For `programmer`, it should normalize:

- technical product names
- language names
- package manager names
- command-line tools
- common Chinese transliterations of tool names
- letter-spaced command tokens

Examples:

- `react` -> `React`
- `typescript` -> `TypeScript`
- `node js` -> `Node.js`
- `git hub` -> `GitHub`
- `p n p m` -> `pnpm`
- `web socket` -> `WebSocket`
- `陶瑞` -> `Tauri`
- `克劳德` -> `Claude`

## Data Model

The first version should treat presets as static built-in data.

Recommended shape:

- preset enum
- per-preset cloud vocabulary metadata
- per-preset local replacement rules

The `programmer` preset should start with a curated, compact term list rather than a giant uncontrolled dictionary.

Suggested seed categories:

- languages: `TypeScript`, `JavaScript`, `Rust`, `Python`
- frontend/backend: `React`, `Node.js`, `Vite`, `WebSocket`
- terminal/dev tools: `GitHub`, `Docker`, `bash`, `zsh`, `pnpm`, `npm`
- product names relevant to this app: `Codex`, `Claude`, `Qwen`, `Tauri`, `xterm`, `AppImage`

## Runtime Data Flow

### Start Session

1. User enables speech input and selects a preset in settings.
2. Frontend stores the preset in app config.
3. When recording starts, the frontend sends `provider`, `apiKey`, `language`, and `preset`.

### Realtime Recognition

1. Rust builds provider request parameters from the selected preset.
2. Aliyun returns intermediate transcript events.
3. Rust normalizes the transcript through the preset normalizer.
4. Frontend receives already-normalized live text.

### Final Transcript

1. Provider emits the final transcript.
2. Rust applies the same preset normalizer.
3. Frontend inserts the normalized final text into the draft.

## UX Surface

Settings should expose a simple selector, not a complex editor.

First version UI:

- `Speech mode`
- options:
  - `General`
  - `Programmer`

The copy should explain the benefit in plain language:

- `Programmer` improves recognition for technical terms, commands, and mixed Chinese-English developer speech.

## Error Handling

### Missing Preset

If the preset is absent in stored config, normalize to `default`.

### Unknown Preset

If an unsupported value is encountered, normalize to `default`.

### Cloud Vocabulary Unavailable

If provider-side vocabulary support is unavailable, the session must still work using local normalization only.

### Empty or Repeated Replacements

The local correction layer must avoid destructive rewrites:

- do not rewrite inside larger unrelated tokens unless the match is explicit
- keep normalization deterministic
- keep transformations idempotent

## Testing Strategy

### Frontend Config Tests

Verify:

- default config includes `preset: "default"`
- invalid stored values fall back to `default`
- store patching updates preset without disturbing other speech config fields

### Settings UI Tests

Verify:

- the preset selector renders
- selecting `programmer` updates config
- localized copy remains correct in Chinese and English

### Voice Backend Tests

Verify:

- start request accepts the new preset field
- preset-specific payload assembly includes the right cloud adaptation parameters
- invalid preset falls back safely

### Normalization Tests

Verify deterministic output for representative phrases such as:

- `打开 react 项目`
- `用 typescript 写一个 hook`
- `运行 p n p m dev`
- `把这个推到 git hub`
- `在 tauri 里面修一下 codex 的输入`

### Regression Tests

Verify:

- `default` preset preserves current behavior
- live transcription still streams
- final transcript insertion remains stable

## Maintainability Rules

- keep preset data separate from voice session control flow
- keep correction logic pure and unit-testable
- do not add user-editable vocabulary UI in this version
- preserve backward compatibility for existing stored configs

## Rollout

Ship this as an internal built-in preset system with one production preset: `programmer`.

This creates the correct foundation for future expansion without over-designing the first release.
