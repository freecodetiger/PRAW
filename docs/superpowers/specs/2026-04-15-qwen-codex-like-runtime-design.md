# Qwen Codex-Like Runtime Design

## Summary

PRAW will stop treating `qwen` as a separately-shaped AI bridge in AI mode.

Instead:

- AI mode will expose one unified workspace runtime.
- `codex` remains a provider adapter behind that runtime.
- `qwen` will be rewritten behind a codex-like shim contract instead of keeping its current `stream-json + stdin` bridge shape.
- the AI-mode bypass capsule will become a workspace-level capability that is always present in structured AI mode for `codex` and `qwen`.
- if the unified structured path cannot continue, the pane falls back to raw terminal mode automatically.

This is an architectural convergence project, not a cosmetic patch.

## Product Goal

`codex` and `qwen` should feel like the same PRAW AI product surface.

Success means:

- `codex` always shows the right-edge AI capsule in structured AI mode
- `qwen` uses the same conversation surface, transcript, copy behavior, and prompt dock behavior as `codex`
- AI responses are selectable and copyable through native DOM transcript behavior, not xterm text extraction
- provider-specific protocol differences do not leak into the visible interaction model
- structured failures degrade to raw terminal mode automatically instead of trapping the user

## User Requirements

The user explicitly approved these constraints:

- `qwen` may lose its current native CLI-specific slash semantics
- PRAW-defined AI workspace semantics take precedence over provider-native semantics
- copy and paste quality matters more than strict CLI fidelity
- `codex` must also have the same bypass capsule behavior instead of being treated as a special case with missing UI
- if the codex-like shim fails, PRAW should automatically fall back to raw terminal mode

## Why The Current Model Is Not Enough

Today the system still has provider-shaped behavior in core runtime paths:

- `codex` uses `exec --json` with prompt-as-argument execution
- `qwen` uses `--input-format stream-json --output-format stream-json`
- `qwen` prompt submission depends on stdin payload injection
- `codex` and `qwen` therefore differ in session creation, resume, model override, and event parsing

Even after recent UI cleanup, this still leaves structural divergence:

- provider-specific command capability checks in frontend composer logic
- provider-specific bridge command builders in backend runtime
- different assumptions about remote session identifiers
- different failure shapes for structured mode

As long as those differences remain first-class, PRAW will keep reintroducing split behavior:

- one provider shows capsule and another does not
- one provider can be copied cleanly while another depends on terminal fallback
- one provider supports a feature through workspace semantics while another routes through a different path

The right fix is to move provider differences below a single internal runtime contract.

## Approaches Considered

### 1. Patch The Existing Multi-Bridge Design

Keep the current `codex`, `qwen`, and `claude` bridge families and continue normalizing behavior in the UI.

Pros:

- smallest near-term change
- least backend churn

Cons:

- provider divergence remains structural
- capsule, transcript, and fallback logic keep depending on backend mode quirks
- future fixes will continue to be provider-specific

Rejected because it preserves the root cause.

### 2. Unified AI Runtime With Provider Adapters

Create one internal runtime contract and move `codex` and `qwen` behind provider adapters. `qwen` is rewritten to satisfy the same internal contract shape as `codex`.

Pros:

- stable UI behavior across providers
- one transcript model, one capsule model, one fallback model
- provider quirks are isolated to adapters

Cons:

- non-trivial backend refactor
- explicit loss of some qwen-native CLI semantics

Chosen approach.

### 3. Fully Service-Backed AI Mode With No CLI Contract

Stop depending on provider CLIs and use direct network/provider SDK integrations.

Pros:

- cleanest long-term architecture

Cons:

- much larger project
- breaks too far away from the current PTY-backed AI mode design

Rejected for this phase.

## Chosen Architecture

### 1. One Structured AI Runtime Contract

Introduce one internal runtime contract for structured AI sessions.

The visible workspace must only depend on normalized events like:

- `bridge-state`
- `assistant-message`
- `system-message`
- `error`
- `turn-complete`
- `session-attached`
- `fallback`

Provider adapters are responsible for translating provider-specific output into this normalized contract.

The workspace must not care whether the underlying provider came from:

- `codex exec --json`
- `qwen` CLI
- a future shim process

### 2. Qwen Becomes A Codex-Like Adapter, Not A Peer Bridge

The current qwen bridge shape will be deleted as a first-class runtime path.

That means:

- no more qwen-specific structured runtime assumptions in the main bridge state machine
- no more qwen-specific prompt payload behavior visible at the runtime boundary
- no more qwen-specific command capability branching as the primary interaction model

Instead, qwen gets an adapter that satisfies the same internal contract used by codex:

- start turn
- submit prompt
- emit assistant output chunks
- attach or restore session identity
- apply model override
- complete turn
- emit fallback on failure

The adapter may still use qwen-specific CLI invocation internally, but those details are hidden inside the adapter and no longer define workspace behavior.

### 3. The Capsule Becomes A Workspace Feature

The right-edge AI capsule is not a provider feature. It is a structured-workspace feature.

Rules:

- if a pane is in structured AI mode, the capsule is always rendered
- this applies equally to `codex` and `qwen`
- the capsule is right-edge anchored and expands leftward
- sending a prompt collapses it back to capsule state
- clicking outside does not dismiss it
- `Esc` dismisses expanded state
- raw fallback may disable or replace the expanded composer, but should not make structured availability depend on provider name

This directly fixes the current user-visible issue where codex may lack the capsule.

### 4. Copy And Paste Move To The Transcript Layer

Copy quality must come from DOM-native transcript rendering, not terminal emulation.

Rules:

- assistant output in structured AI mode is rendered as selectable transcript DOM
- copy actions should use transcript text, not PTY ANSI output
- mouse selection, keyboard copy shortcuts, and contextual copy all operate on the transcript layer
- terminal fallback remains available, but structured AI mode should not depend on xterm selection for core copy behavior

This is the mechanism that allows qwen and codex to feel equally stable and Warp-like.

### 5. Raw Fallback Is Mandatory

If the unified structured path fails, the pane must automatically degrade to raw terminal mode.

Failure examples:

- provider adapter spawn failure
- malformed provider event stream
- missing structured capability for the invoked command
- adapter handshake timeout
- provider CLI auth or environment flow that cannot be expressed through the structured runtime

Fallback rules:

- emit a structured fallback event
- switch the pane to raw terminal ownership
- preserve transcript history already accumulated
- preserve the pane and tab identity
- do not silently discard the user’s context

This keeps the system resilient while still allowing aggressive runtime unification.

## Runtime Boundaries

### Structured AI Mode

Structured AI mode owns:

- transcript rendering
- right-edge capsule
- fixed composer
- DOM selection and copy
- normalized system/help/status messaging
- provider metadata display

### Raw Terminal Mode

Raw terminal mode owns:

- native keystroke semantics
- password prompts
- full-screen TUIs
- provider flows that cannot be normalized safely

Transition into raw mode must be explicit and event-driven.

## Provider Adapter Contract

Each structured provider adapter must implement the same logical operations:

- `start_session`
- `submit_prompt`
- `reset_session`
- `attach_session`
- `set_model`
- `stream_events`
- `fallback_to_raw`

### Codex Adapter

Codex remains the reference adapter.

Its implementation may keep using `codex exec --json`, but the runtime must consume codex through the common adapter interface rather than treating codex behavior as hard-coded runtime behavior.

### Qwen Adapter

Qwen becomes a codex-like adapter.

Requirements:

- it must expose session attach/resume through the common adapter contract
- it must expose model override through the common adapter contract
- it must normalize output into the common assistant/error/turn lifecycle events
- it must hide qwen-specific stdin payload details from the rest of the application
- it must emit raw fallback when qwen cannot satisfy the contract for a given invocation

## Frontend Changes

### 1. Structured Surface Gating

The frontend should no longer effectively express:

- `codex behaves this way`
- `qwen behaves another way`

Instead it should express:

- `structured AI runtime available`
- `structured AI runtime unavailable, raw fallback active`

### 2. Unified Composer Semantics

The main composer and capsule composer should use runtime capabilities, not provider-name heuristics.

For example:

- `/help` is always workspace-defined
- `/new` is workspace-defined
- `/resume` is available if the adapter supports attach or restore
- `/model` is available if the adapter supports model override
- unsupported actions open Expert Drawer or trigger raw fallback

### 3. Codex Capsule Fix

Codex currently missing the capsule is treated as a bug in runtime gating, not a design exception.

This redesign requires:

- codex structured mode always exposes the capsule
- qwen structured mode exposes the same capsule
- capsule rendering cannot depend on provider-specific bridge quirks

## Backend Changes

### 1. Bridge Refactor

The existing bridge code should be decomposed into:

- runtime orchestration
- provider adapter registry
- codex adapter
- qwen adapter
- common normalized event types

### 2. Qwen Shim Layer

The qwen shim is allowed to be implemented as:

- an internal adapter module
- a dedicated helper process
- a qwen wrapper command launched by the bridge

The implementation choice is secondary.

The required property is:

- the rest of PRAW sees qwen as a codex-like structured adapter, not as a different interaction family

### 3. Session Identity

Codex and qwen session identity must be normalized into one adapter-level concept.

The runtime should not assume:

- codex sessions are special because they are backed by `.codex` history files
- qwen sessions are special because they are synthetic IDs

Instead:

- adapter owns provider-native session lookup and restoration
- runtime owns only normalized `attach_session(sessionId)` semantics

## Migration Strategy

### Phase 1: Introduce Adapter Interface

- add common structured adapter trait or interface
- move codex logic behind it without changing product behavior

### Phase 2: Rebuild Qwen Behind The Adapter

- remove qwen as a first-class custom bridge path
- implement qwen codex-like adapter or shim
- normalize model, resume, and turn lifecycle behavior

### Phase 3: Make Capsule Runtime-Level

- remove provider-specific gating from capsule availability
- guarantee codex and qwen structured panes both show the capsule

### Phase 4: Remove Dead Qwen Bridge Paths

- delete old qwen bridge command builders and parser paths that no longer match the adapter design
- keep only adapter-internal implementation details

### Phase 5: Harden Raw Fallback

- ensure structured failures consistently degrade to raw terminal mode
- preserve transcript and pane state during fallback

## Testing Strategy

### Backend Tests

- codex adapter emits normalized lifecycle events
- qwen adapter emits the same normalized lifecycle events
- qwen adapter model override follows the common contract
- qwen adapter attach/resume follows the common contract
- adapter failures emit fallback events

### Frontend Tests

- codex structured AI mode renders the capsule
- qwen structured AI mode renders the same capsule
- codex and qwen share identical transcript selection and copy behavior
- structured unsupported commands route to Expert Drawer or fallback according to runtime capability
- fallback preserves transcript and shifts interaction to raw terminal mode

### Integration Tests

- launch codex and verify capsule, prompt send, copy, and transcript flow
- launch qwen through the new shim and verify the same workflow
- force adapter failure and verify automatic raw fallback

## Risks

### 1. Qwen CLI Divergence

Qwen may not map cleanly to codex-like session semantics forever.

Mitigation:

- keep adapter boundary explicit
- keep raw fallback robust

### 2. Partial Migration Confusion

If qwen old paths and new adapter paths coexist too long, the codebase will become more confusing before it gets simpler.

Mitigation:

- treat deletion of old qwen bridge paths as part of the same project, not optional cleanup

### 3. Overfitting To Codex

“Codex-like” must mean normalized runtime semantics, not codex-branded wording or codex-only assumptions.

Mitigation:

- keep adapter capability vocabulary generic
- remove codex-specific copy from common UI wherever it is not truly codex-only

## Decision

PRAW will unify structured AI mode around one workspace runtime.

`codex` remains the reference provider adapter.

`qwen` will stop being a separately-shaped bridge and will be rebuilt behind a codex-like structured adapter or shim.

The right-edge capsule becomes a guaranteed structured-workspace feature for both `codex` and `qwen`.

If the unified structured path fails, PRAW automatically falls back to raw terminal mode.
