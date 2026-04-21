# AI Completion Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dialog-mode AI suggestions visible, distinguishable from local/system suggestions, and diagnosable when loading, empty, timed out, or failed.

**Architecture:** Keep the existing suggestion engine shape, but add explicit AI request state and structured command results. Local suggestions continue to render first; AI suggestions append later and carry visible `AI` source labels. Backend AI suggestion commands return structured status instead of collapsing all failures into `None`.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri invoke API, Rust, reqwest, serde.

---

## File Map

- `src/domain/suggestion/types.ts`: Add frontend AI suggestion result and status types.
- `src/lib/tauri/ai.ts`: Return structured AI suggestion command results, preserving legacy fallback for older/null responses.
- `src/features/terminal/hooks/useSuggestionEngine.ts`: Track AI inline/recovery request state separately from candidates.
- `src/features/terminal/components/SuggestionBar.tsx`: Render source badges and AI status.
- `src/features/terminal/components/DialogIdleComposer.tsx`: Pass AI status to suggestion bar.
- `src/features/terminal/components/DialogIdleComposer.test.tsx`: Cover source badges and AI status behavior.
- `src-tauri/src/ai/types.rs`: Add structured AI suggestion command result/status types.
- `src-tauri/src/commands/ai.rs`: Stop swallowing AI suggestion errors as plain absence.
- `src-tauri/src/ai/mod.rs`: Increase completion timeout and classify AI suggestion errors.
- `src-tauri/src/ai/providers/*.rs`: Return empty results distinctly where practical.

---

### Task 1: UI Source Badges

**Files:**
- Modify: `src/features/terminal/components/SuggestionBar.tsx`
- Modify: `src/features/terminal/components/DialogIdleComposer.test.tsx`
- Modify: `src/app/styles.css`

- [x] **Step 1: Write failing component test**

Add a test that returns local, system, and AI candidates, opens the suggestion bar, and expects `Local`, `System`, and `AI` labels to be rendered.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx`

Expected: FAIL because source labels are not rendered.

- [x] **Step 3: Render source labels**

Update `SuggestionBar` to render a source label for every row using `suggestion.source`.

- [x] **Step 4: Style source labels**

Add compact source chip styles near existing suggestion kind styles.

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx`

Expected: PASS.

---

### Task 2: Frontend AI Status

**Files:**
- Modify: `src/domain/suggestion/types.ts`
- Modify: `src/lib/tauri/ai.ts`
- Modify: `src/features/terminal/hooks/useSuggestionEngine.ts`
- Modify: `src/features/terminal/components/SuggestionBar.tsx`
- Modify: `src/features/terminal/components/DialogIdleComposer.tsx`
- Modify: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [x] **Step 1: Write failing tests for loading, timeout, and empty states**

Add tests that:

- keep an AI request pending and expect `AI loading...`
- resolve with timeout and expect `AI timed out`
- resolve with empty result and expect `AI returned 0 suggestions`

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx`

Expected: FAIL because AI status is not tracked or rendered.

- [x] **Step 3: Add TypeScript result/status types**

Add `AiSuggestionCommandResult` and `AiSuggestionStatus` to suggestion domain types.

- [x] **Step 4: Normalize Tauri responses**

Update `requestAiInlineSuggestions` and `requestAiRecoverySuggestions` to return structured command results and normalize legacy `null` or old `SuggestionResponse` payloads.

- [x] **Step 5: Track AI status in `useSuggestionEngine`**

Set `loading` when AI starts, `success` when suggestions arrive, `empty` when none survive, `timeout` for timeout status, and `error` for other failures. Preserve local suggestions in all non-success AI paths.

- [x] **Step 6: Render status**

Pass status from `DialogIdleComposer` to `SuggestionBar` and render compact status text in the suggestion header.

- [x] **Step 7: Run tests to verify pass**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx`

Expected: PASS.

---

### Task 3: Backend Structured Results and Timeout

**Files:**
- Modify: `src-tauri/src/ai/types.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/ai/mod.rs`
- Modify: `src-tauri/src/ai/providers/openai_compatible.rs`
- Modify: `src-tauri/src/ai/providers/anthropic.rs`
- Modify: `src-tauri/src/ai/providers/gemini.rs`

- [x] **Step 1: Write failing Rust tests**

Add focused tests for AI suggestion result construction/classification:

- timeout maps to `timeout`
- provider HTTP auth maps to `authError`
- empty suggestions are distinguishable from transport failure

- [x] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ai::`

Expected: FAIL because structured AI suggestion result types do not exist.

- [x] **Step 3: Add structured result types**

Add serializable Rust types for `AiSuggestionCommandResult` and status values using camelCase JSON names.

- [x] **Step 4: Increase completion timeout**

Change completion request timeout from `1_500` to `5_000`.

- [x] **Step 5: Map provider results**

Update AI suggestion commands to return structured statuses:

- `success` with suggestions
- `empty` with no suggestions
- `timeout`
- `authError`
- `networkError`
- `providerError`
- `parseError` where parse failure is distinguishable

- [x] **Step 6: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ai::`

Expected: PASS.

---

### Task 4: Verification

**Files:**
- No intentional production edits unless verification exposes a defect.

- [x] **Step 1: Run targeted frontend tests**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx src/features/terminal/lib/suggestion-engine.test.ts`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 3: Run Rust AI tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ai::`

Expected: PASS.

- [x] **Step 4: Check worktree**

Run: `git status --short`

Expected: only intended files changed.
