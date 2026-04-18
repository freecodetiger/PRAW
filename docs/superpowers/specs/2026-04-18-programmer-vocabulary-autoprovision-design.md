# Programmer Vocabulary Auto-Provision Design

Date: 2026-04-18

## Goal

Make the distributed app usable with programmer hotwords for every user, even when they provide their own Aliyun API key instead of using the developer's account resources.

The app must automatically create and cache a per-user programmer vocabulary when needed, then reuse that `vocabulary_id` in later realtime ASR sessions.

## Problem

The current `programmer` speech preset is bound to a fixed `vocabulary_id` created under one specific Aliyun account.

That works only for the account that owns that hotword resource. Once the application is distributed:

- other users will provide their own Aliyun API keys
- their accounts will not own the hard-coded `vocabulary_id`
- realtime ASR requests may fail or be ignored when trying to use that foreign vocabulary

This makes the current cloud hotword integration unsuitable for general distribution.

## Product Decision

Keep the `programmer` preset as the product surface, but switch the cloud hotword implementation from:

- static shared vocabulary id

to:

- per-user automatic vocabulary provisioning

Behavior:

1. User enters their own speech API key.
2. User selects `Programmer` mode.
3. The first time programmer speech input is used, the app automatically ensures a programmer vocabulary exists for that user account.
4. If creation succeeds, the returned `vocabulary_id` is stored in local config and reused later.
5. If creation fails, speech transcription still starts and continues with local normalization only.
6. The user receives a non-blocking status or warning message explaining that cloud hotword enhancement is unavailable.

## Non-Goals

- letting users edit the hotword list in this version
- managing multiple programmer vocabulary versions in the UI
- listing or deleting all remote vocabularies from the app
- blocking speech transcription when vocabulary provisioning fails
- creating vocabularies for presets other than `programmer`

## Recommended Approach

Add a small provisioning layer between speech startup and realtime ASR task creation.

Recommended flow:

1. Frontend still starts voice transcription exactly once.
2. Rust checks whether the current request uses the `programmer` preset.
3. If not, it proceeds normally.
4. If yes, Rust checks local config for a cached programmer `vocabulary_id`.
5. If a cached id exists, use it directly.
6. If it does not exist, call the Aliyun customization API with the current user's API key, create a programmer vocabulary, persist the returned id, and then start the websocket session with that id.
7. If creation fails, emit a warning status and continue without `vocabulary_id`.

This keeps the product behavior automatic while preserving reliability.

## Alternatives Considered

### 1. Keep a hard-coded shared vocabulary id

Pros:

- zero extra code

Cons:

- not distributable
- tied to one account
- likely to fail for other users

Rejected.

### 2. Add a manual “Initialize programmer vocabulary” button

Pros:

- explicit user control
- easier to reason about operationally

Cons:

- adds friction
- many users will never initialize it
- worse out-of-box experience

Useful later as an advanced affordance, but not sufficient as the primary flow.

### 3. Auto-provision on first programmer speech use

Pros:

- best distribution experience
- no extra setup beyond user API key
- preserves a simple product model

Cons:

- first programmer-mode startup performs one extra API call
- requires a small persistence and provisioning layer

Recommendation: use option 3.

## Architecture

### 1. Config Layer

Extend speech config with per-user programmer vocabulary state:

- `programmerVocabularyId: string`
- `programmerVocabularyStatus: "idle" | "creating" | "ready" | "failed"`
- `programmerVocabularyError: string`

These values are local, per-user, and tied to the current app config file.

The `vocabulary_id` should be treated as a cache, not a permanent assumption. If it becomes invalid later, the app can clear and recreate it in a future iteration.

### 2. Vocabulary Definition Layer

Move the built-in programmer hotword list into a dedicated Rust module.

That module should own:

- the fixed built-in programmer vocabulary entries
- the logic that serializes them for Aliyun create requests

The list should not be duplicated across tests and runtime code.

### 3. Provisioning Layer

Introduce a dedicated Rust helper that ensures a programmer vocabulary exists for the current user.

Input:

- app handle or config manager access
- current speech API key
- current speech config snapshot

Output:

- `Some(vocabulary_id)` if ready
- `None` when unavailable or creation failed

Responsibilities:

- short-circuit for non-programmer presets
- reuse cached id if present
- create the vocabulary if missing
- persist the new id and status
- return `None` on failure without aborting speech startup

### 4. Voice Session Layer

The realtime voice session should no longer read `vocabulary_id` from a hard-coded preset constant.

Instead:

- parse preset
- optionally ensure a user-owned programmer vocabulary
- inject the resulting id into the websocket `run-task` parameters

This preserves the current provider boundary inside the Rust voice module.

### 5. Frontend Status Surface

The frontend should stay simple.

It does not need a dedicated vocabulary management panel in this version.

It only needs to surface backend status messages such as:

- `Preparing programmer vocabulary…`
- `Programmer cloud vocabulary unavailable. Using local enhancement instead.`

These are informational and must not block recording.

## Data Flow

### First Programmer-Mode Use

1. User starts voice transcription with preset `programmer`.
2. Rust emits `Preparing programmer vocabulary…`
3. Rust checks local speech config.
4. No cached id exists.
5. Rust calls Aliyun customization API using the user's API key.
6. Aliyun returns a fresh `vocabulary_id`.
7. Rust persists:
   - id
   - status `ready`
   - cleared error
8. Rust opens realtime websocket and injects that `vocabulary_id`.

### Later Programmer-Mode Use

1. User starts voice transcription with preset `programmer`.
2. Rust finds cached `programmerVocabularyId`.
3. Rust uses it directly.
4. No create request is needed.

### Create Failure

1. User starts programmer-mode voice transcription.
2. Vocabulary creation fails.
3. Rust persists:
   - empty or unchanged id
   - status `failed`
   - error message
4. Rust emits warning status text.
5. Rust continues realtime ASR without `vocabulary_id`.
6. Local transcript normalization still runs.

## Error Handling

### Missing API Key

Handled by the existing speech startup validation. No provisioning attempt should run.

### Provisioning Request Failure

Do not abort transcription. Emit warning status and proceed without cloud hotwords.

### Invalid Cached Vocabulary Later

Not required for the first version, but the design should keep this recoverable by allowing the cached id to be cleared and recreated in a future patch.

### Duplicate Provisioning

Only one provisioning attempt should run per voice startup path. The helper should not issue repeated create requests during one session.

## Testing Strategy

### Frontend Config Tests

Verify new speech fields default correctly and normalize missing values safely.

### Rust Config Tests

Verify the new speech vocabulary state serializes and deserializes correctly.

### Provisioning Unit Tests

Verify:

- non-programmer preset skips provisioning
- cached id is reused
- successful create returns and persists a new id
- failed create returns `None` and preserves transcription fallback behavior

### Voice Session Tests

Verify:

- programmer preset uses a cached or newly provisioned id in `run-task`
- default preset does not inject a vocabulary id
- failure path still builds a valid `run-task` without `vocabulary_id`

## Maintainability Rules

- keep vocabulary provisioning logic out of UI components
- keep the built-in programmer vocabulary list in one Rust module
- keep failure handling non-blocking
- do not reintroduce a hard-coded shared remote resource assumption

## Rollout

This should replace the current hard-coded programmer `vocabulary_id` strategy.

Once implemented, the distributed application becomes self-contained:

- every user can use their own Aliyun key
- every user can automatically get their own programmer hotword enhancement
- local normalization remains the fallback safety net
