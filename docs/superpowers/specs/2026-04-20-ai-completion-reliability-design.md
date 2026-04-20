# AI Completion Reliability Design

Date: 2026-04-20
Project: PRAW
Scope: Dialog-mode AI completion reliability, visibility, and diagnostics

## Goal

Make dialog-mode AI completion visibly reliable instead of feeling dead or indistinguishable from local prefix matching.

The user-facing requirements are:

- keep local completion fast and visible immediately
- append AI suggestions into the same candidate list when they arrive
- show every candidate source as `AI`, `Local`, or `System`
- show AI request status in the suggestion surface
- avoid silent AI failures
- use a realistic timeout for completion requests

This work focuses on the idle dialog composer. It does not change AI workflow mode, PTY execution, terminal sessions, or command submission.

## Current Behavior

The current AI completion path is difficult to trust for two reasons.

First, AI suggestions are hard to observe. `SuggestionItem` already carries a `source` field, but the candidate UI only renders the suggestion kind, such as `completion`, `intent`, or `recovery`. A user cannot tell whether a row came from the model, local history/path matching, or built-in workflow logic. The ghost overlay also shows only a suffix, with no source or state.

Second, AI failures are silent. The Rust Tauri commands collapse provider errors into `None`, and the frontend also catches errors as `null`. A timeout, auth issue, parse failure, empty model response, and disabled configuration all look the same: no AI suggestions. This makes the feature feel dead even when the provider connection test succeeds.

There is also a likely timeout mismatch. Connection tests use an 8 second timeout and a tiny response, while completion requests use a 1.5 second timeout and ask the model to generate structured JSON. A provider that answers connection tests in under 2 seconds can still fail most completion requests.

## Non-Goals

- no rewrite of AI workflow mode
- no changes to PTY runtime behavior
- no command execution changes
- no streaming model responses
- no project-wide semantic indexing
- no AI-only candidate grouping in this phase
- no ranking overhaul beyond preserving source metadata
- no broad redesign of phrase completion

## Decision

Use a reliability-first refactor.

Keep the current broad shape of the dialog suggestion engine, but separate local candidate availability from AI request state. Local suggestions should remain fast. AI should be independently observable: loading, success, empty result, timeout, or error.

This is intentionally smaller than a full source/session architecture rewrite, but it should leave room for that later.

## User Experience

### Candidate Source Badges

Every visible candidate row must show its source.

Source labels:

- `AI`: model-generated suggestion
- `Local`: local history, path, git branch, file system, or tool-aware completion
- `System`: built-in workflow or static rule suggestion

Each candidate should continue to show its kind as a secondary label:

- `completion`
- `correction`
- `intent`
- `recovery`

Example candidate rows:

```text
AI     intent      docker compose logs api
Local  history     git status
System intent      git commit -m ""
```

The exact visual style can follow the existing suggestion kind chip style, but source and kind must both be visible.

### AI Status

The suggestion surface should expose AI request state. The state can live in the suggestion bar header or a small inline status row near the composer.

Required states:

- `AI loading...`
- `AI timed out`
- `AI returned 0 suggestions`
- `AI unavailable`
- `AI error`

The status text should be short. Detailed provider messages should not dominate the composer.

### Local First, AI Later

When the draft changes:

1. Local completion still runs first and updates the list quickly.
2. If AI is eligible, the UI enters `AI loading...`.
3. If AI returns suggestions for the current draft generation, AI candidates are merged into the existing list.
4. If AI returns no usable suggestions, local suggestions remain and status becomes `AI returned 0 suggestions`.
5. If AI times out or fails, local suggestions remain and status reflects the failure.

This preserves responsiveness while making AI behavior visible.

### Expired Requests

When the draft changes, older AI responses must not mutate the current candidate list.

The existing generation guard should remain, but expired AI results should no longer be indistinguishable from ordinary absence. The current generation should own the visible AI status.

## Architecture

### Frontend State

Extend the dialog suggestion engine state with explicit AI status.

Suggested model:

```ts
type AiSuggestionStatus =
  | { state: "idle" }
  | { state: "disabled"; reason: "config" | "provider" | "context" | "dangerous-prefix" }
  | { state: "loading" }
  | { state: "success"; latencyMs: number; count: number }
  | { state: "empty"; latencyMs?: number }
  | { state: "timeout" }
  | { state: "error"; reason: string };
```

The exact names can change, but the behavior must distinguish loading, empty, timeout, and error.

`useSuggestionEngine` should return this status alongside:

- `ghostSuggestion`
- `visibleSuggestions`
- `activeGroup`
- accept/dismiss handlers

`DialogIdleComposer` should pass the status to `SuggestionBar` or a nearby status renderer.

### Backend Response Shape

The current Tauri AI suggestion commands return `Option<SuggestionResponse>` and swallow all errors as `None`.

For AI suggestion requests, introduce a structured command response that can represent:

- success with suggestions
- success with zero suggestions
- timeout
- auth error
- network error
- provider error
- parse error

Suggested shape:

```ts
interface AiSuggestionCommandResult {
  status: "success" | "empty" | "timeout" | "authError" | "networkError" | "providerError" | "parseError";
  suggestions: SuggestionItem[];
  latencyMs?: number;
  message?: string;
}
```

The exact Rust and TypeScript naming can follow existing conventions, but the frontend must no longer rely on `null` to mean every possible condition.

### Timeout

Increase AI completion request timeout from `1_500ms` to a more realistic value.

Use `5_000ms` as the first target. The provider connection test can remain at `8_000ms`.

Rationale:

- the user has observed connection-test latency under 2 seconds
- completion requests ask for structured JSON and use more tokens than the connection test
- 1.5 seconds is too aggressive for public model APIs
- local suggestions keep the UI responsive while AI is pending

If future testing shows 5 seconds is too long, make the value configurable or split provider-specific defaults.

### Parsing and Sanitization

Keep existing safety filters:

- maximum suggestion length
- no newline commands
- destructive-pattern rejection
- append suggestions must start with the current draft

Improve observability around parse failures. If the provider returns content that cannot be parsed into structured suggestions, report `parseError` or `empty` based on whether content existed.

This phase does not redesign prompt format unless tests show the parser rejects common valid provider output.

### Candidate Merge

Merge candidates from existing sources:

- local candidates mapped to `source: "local"`
- AI suggestions with `source: "ai"`
- workflow suggestions with `source: "system"`

Deduping should preserve the best candidate while retaining a truthful source. If the same text appears from multiple sources, prefer the source of the higher-ranked candidate. Do not relabel local or system candidates as AI.

## Data Flow

1. User edits the dialog draft.
2. `useSuggestionEngine` creates a new generation id and clears stale inline AI state.
3. Local completion request runs after the debounce.
4. Local response updates context and local candidates.
5. If AI eligibility checks pass, AI status becomes `loading`.
6. AI request runs with the local context.
7. AI response is ignored if generation is stale.
8. Current-generation AI response updates status:
   - suggestions merged on success
   - `empty` if no suggestions survive parsing/sanitization
   - `timeout` or `error` on provider failure
9. Candidate UI renders source and kind for every row.

## Eligibility Rules

Keep the existing eligibility rules for the first pass:

- terminal status is `running`
- pane mode is `dialog`
- cursor is at the end
- user is not browsing history
- IME composition is not active
- composer is focused
- draft length is at least 2 characters
- AI is enabled
- API key is present
- model is present
- provider supports inline suggestions
- local context is available
- dangerous prefixes are not requested

If a rule prevents AI from running, the status may be `idle` or `disabled` depending on whether the suggestion surface is visible. Avoid noisy disabled messages during ordinary typing before AI is eligible.

## Error Handling

### Timeout

If the provider request exceeds the completion timeout, surface `AI timed out`.

Local candidates must remain visible.

### Provider and Network Errors

Provider errors should be mapped to compact states. Examples:

- auth failure: `AI unavailable`
- rate limit or bad model: `AI error`
- connection failure: `AI error`

Detailed messages can be kept available for debugging but should not flood the composer.

### Empty Results

If the provider succeeds but returns no suggestions, or all suggestions are filtered out, show `AI returned 0 suggestions`.

### Stale Results

Stale responses should be ignored. The current generation owns the visible AI status.

## Testing Strategy

### Frontend Unit Tests

Update suggestion engine tests to cover:

- AI status becomes `loading` when an AI request is started
- local suggestions remain visible while AI is loading
- AI suggestions are appended when the AI response succeeds
- AI empty response produces an empty status without clearing local suggestions
- AI timeout/error produces visible status without clearing local suggestions
- stale AI response does not mutate candidates or status for the latest draft
- AI source badge data is preserved in visible suggestions

### Component Tests

Update `DialogIdleComposer` and/or `SuggestionBar` tests to cover:

- every candidate row renders a source label
- AI candidate rows render `AI`
- local candidate rows render `Local`
- system/workflow candidate rows render `System`
- suggestion header or status row renders `AI loading...`
- timeout state renders `AI timed out`

### Backend Tests

Update Rust AI tests to cover:

- timeout classification maps to a structured result
- provider errors are not collapsed into `None`
- parse failures can be reported distinctly
- empty parsed suggestions remain distinguishable from transport failure

### Regression Tests

Preserve existing behavior:

- local completion still appears before AI
- ghost append acceptance still works
- candidate navigation still works
- recovery suggestions still use replace mode
- dangerous command filters still reject unsafe suggestions

## Rollout Plan

1. Add source labels to the suggestion UI.
2. Add frontend AI status state while preserving the current backend response.
3. Increase completion timeout to 5 seconds.
4. Introduce structured backend AI suggestion results.
5. Wire frontend status to structured backend results.
6. Add tests for source labels, AI loading, timeout, empty, and error states.

This order gives immediate visibility first, then improves reliability and diagnostics.

## Risks

- More visible AI status could become noisy if shown before AI is eligible.
- A 5 second timeout could leave `AI loading...` visible too long if not styled quietly.
- Structured backend responses require TypeScript and Rust type updates together.
- Source deduping can be misleading if identical text comes from multiple sources; tests must lock the chosen behavior.

## Open Decisions

No unresolved product decisions remain for this scope.

Implementation may choose exact type names and CSS class names, but it must preserve the requirements above.

## Acceptance Criteria

1. Candidate rows show `AI`, `Local`, or `System`.
2. Candidate rows still show suggestion kind.
3. Local suggestions appear quickly even while AI is pending.
4. AI status is visible when loading, timed out, empty, or failed.
5. Completion timeout is no longer 1.5 seconds.
6. AI errors are not silently collapsed into plain absence.
7. AI suggestions, when returned, are merged without clearing local suggestions.
8. Stale AI responses do not affect the current draft.
9. Tests cover source labels and AI status behavior.
