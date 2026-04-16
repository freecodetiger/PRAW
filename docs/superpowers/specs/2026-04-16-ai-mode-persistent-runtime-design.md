# AI Mode Persistent Runtime Design

**Status:** Proposed and approved at the design level

**Goal**

Rebuild AI mode around a persistent raw terminal runtime so Codex/Qwen/Claude raw-fallback sessions remain stable, copyable, and visually correct across mode switches, split panes, remounts, resizes, and focus changes.

**Non-Goals**

- Reintroducing structured AI transcript UI as the primary AI mode experience
- Making AI mode behave like a chat document instead of a raw terminal
- Rewriting ordinary dialog command history unless required to decouple it from AI runtime state

## Problem Statement

The current AI mode is unstable because the visible terminal is not treated as the long-lived source of truth. Instead, PTY output is reduced into a plain-text mirror and later replayed into xterm when panes remount.

That model is acceptable for simple linear shell output, but it breaks down for Codex-like CLIs that frequently repaint, move the cursor, redraw panels, and use terminal semantics that cannot be faithfully reconstructed from a plain-text approximation.

The observed user-facing failures all follow from this mismatch:

- AI mode can show polluted background content when entering from dialog mode
- Splitting panes can cause the original pane to visually change even though its logical state should be preserved
- Remounts can inject duplicated or degraded screen content
- Copy and selection can become inconsistent with the visible terminal content
- Screen restoration quality depends on replay heuristics instead of the actual terminal state

## Root Cause Summary

### 1. Wrong source of truth

`terminal-screen-mirror.ts` stores a downgraded plain-text representation of terminal output. This is not a true VT/xterm screen state.

### 2. Double hydration on remount

The remount path currently writes terminal state back more than once, amplifying corruption and duplication.

### 3. Late reset semantics

AI mode transition cleanup currently happens inside mounted presentation code, which is too late to prevent first-frame contamination.

### 4. Mixed responsibilities

The same recovery path is trying to serve both:

- command archive/history
- active raw terminal rendering

Those are different data products and must not share the same recovery model.

## Design Principles

### 1. Runtime is the truth

The active terminal state for AI mode must live in a persistent runtime object, not in a replayable plain-text snapshot.

### 2. UI may detach, runtime may not

React remounts, split panes, focus changes, and layout updates must only attach or detach views from a terminal runtime. They must not reconstruct its screen from downgraded text.

### 3. Archive and screen are separate products

Command history archive may remain text-oriented. AI raw screen state may not.

### 4. AI mode stays raw-like

AI mode continues to behave like a raw CLI surface with stable copy/paste and native command semantics such as `/resume` and `/model`.

### 5. Prefer staged migration with rollback

The new runtime model should be introduced behind a scoped feature boundary so AI mode can move first without destabilizing ordinary dialog mode.

## Target Architecture

## Layer 1: Terminal Runtime Layer

Introduce a persistent `TerminalRuntimeManager` keyed by `tabId`.

Each `TerminalRuntime` owns:

- the binding to the PTY session
- the live terminal state used for rendering
- viewport metadata
- selection/focus metadata where needed
- lifecycle methods: `attach`, `detach`, `dispose`
- interaction methods: `focus`, `paste`, `copySelection`, `resize`

Expected properties:

- runtime survives React remounts
- runtime survives split-triggered surface replacement for the existing pane
- runtime is explicitly disposed only when the tab/session is truly removed or restarted

### Runtime responsibilities

- consume PTY output exactly once
- forward output to the attached live terminal surface
- preserve state while no surface is attached
- expose the currently selected text for copy integration
- maintain scroll/viewport state needed for reattachment

### Runtime constraints

- no replay from downgraded text for AI mode
- no UI component owns the terminal truth
- no presentation component may clear or reset runtime as a side effect of mounting

## Layer 2: Presentation Layer

Presentation becomes a pure view decision over stable runtime-backed state.

Modes:

- `dialog`
- `classic`
- `agent-workflow`

Responsibilities:

- choose which surface to display
- render shell-specific affordances such as prompt capsules and history UI
- never own raw terminal state directly

AI mode presentation should render:

- one raw terminal host attached to the persistent runtime
- one auxiliary prompt capsule/overlay
- no structured transcript as the primary view

Dialog presentation should render:

- transcript/history blocks
- optional live command console view when required
- command composer

## Layer 3: Mode Orchestration Layer

Introduce a centralized mode transition flow that handles terminal presentation changes before UI mount effects run.

The orchestration layer must:

- process semantic events such as `agent-workflow` and `classic-required`
- decide the next presentation and runtime policy
- ensure transition side effects happen transactionally
- prevent per-component reset logic from racing with mount-time hydration

Required rule:

When a tab transitions into AI mode, the system must not rely on a component-local `useEffect` to repair stale screen state after rendering begins.

## Layer 4: Archive Layer

Split the concepts currently mixed together.

### Command archive product

Used by dialog/history.

Properties:

- command scoped
- text oriented
- suitable for transcript rendering and historical review

### Active terminal screen product

Used by AI mode and any runtime-backed raw terminal views.

Properties:

- runtime backed
- not reconstructed from plain-text mirror for fidelity-critical surfaces
- lifecycle coupled to the tab runtime, not to React mount cycles

Rule:

AI mode must not use command archive text or mirror replay text to rebuild its visible screen.

## Layer 5: Clipboard and Selection Layer

Clipboard behavior must be raw-terminal-native, with application-level fallback only as a compatibility enhancement.

### Primary copy path

- user selects text in the live AI terminal
- copy operates on the real terminal selection
- pasted output reflects the actual visible buffer contents

### Secondary compatibility path

- app shortcut integration may call runtime clipboard helpers
- context menu copy may delegate to runtime selection APIs when browser defaults are insufficient

Rules:

- transcript copy and raw terminal copy remain separate concepts
- AI mode copy must never depend on transcript DOM
- selection must survive attach/detach semantics as naturally as possible within xterm constraints

## Layer 6: Split and Remount Semantics

This layer defines required behavior rather than implementation detail.

### Split behavior

When the user splits an existing pane:

- the original tab keeps its existing runtime unchanged
- the new tab gets a fresh runtime and fresh shell session
- the original pane may visually lose/gain focus, but its content must not mutate as a consequence of the split itself

### Remount behavior

When a pane surface remounts because of layout changes:

- the runtime detaches from the old surface
- the runtime attaches to the new surface
- the screen must not be rebuilt from degraded mirror text
- the attach path must not replay duplicate content

### Restart behavior

When a tab/session is explicitly restarted:

- the old runtime is disposed
- a new runtime is created
- only then may the visual terminal reset to a new clean state

## Layer 7: Compatibility Layer

The system may keep a lightweight text snapshot path for ordinary shell and dialog use cases where that remains useful.

Recommended split:

- `PlainTextArchivePolicy` for dialog/archive/history
- `PersistentRuntimePolicy` for AI mode and fidelity-sensitive terminal workflows

This preserves existing value from command archiving while removing AI mode from the broken replay model.

## Proposed Module Boundaries

The exact file layout can follow current repo conventions, but the responsibilities should separate roughly as follows.

### `terminal-runtime/`

Owns:

- runtime manager
- runtime lifecycle
- PTY attachment
- viewport and selection persistence for raw surfaces

### `terminal-presentation/`

Owns:

- presentation mode resolution
- transition orchestration
- surface policy selection

### `terminal-archive/`

Owns:

- command archive extraction
- command-delta computation
- transcript-facing text output only

### `terminal-surface/`

Owns:

- React host surfaces
- attach/detach wiring
- UI composition such as prompt capsule and headers

## Migration Strategy

Use staged migration with rollback capability.

### Phase 1: Introduce persistent runtime abstractions

Scope:

- add runtime manager and runtime lifecycle
- keep old mirror-based archive path intact for dialog mode
- do not yet change all presentations

Success criteria:

- one tab owns one stable runtime
- remount no longer requires mirror text replay for the runtime-backed surface

### Phase 2: Move AI mode to runtime-backed raw surface

Scope:

- switch `agent-workflow` to runtime-backed terminal host
- remove AI mode dependence on replay-based screen restoration
- keep prompt capsule as auxiliary input only

Success criteria:

- entering AI mode shows a clean and stable raw terminal
- no stale dialog transcript background appears on entry

### Phase 3: Normalize split/detach semantics

Scope:

- ensure split creates new runtime only for the new tab
- old tab runtime only detaches/attaches
- eliminate duplicate hydration paths

Success criteria:

- split does not visually mutate the original pane
- remount does not duplicate or degrade the screen

### Phase 4: Harden clipboard and selection

Scope:

- unify raw terminal copy behavior
- add shortcut and context-menu fallback integration where needed
- validate paste remains compatible with native CLI semantics

Success criteria:

- AI mode copy is stable with mouse and shortcuts
- paste works for raw CLI commands like `/resume` and `/model`

### Phase 5: Reduce or retire AI-facing mirror behavior

Scope:

- remove AI mode from mirror replay paths entirely
- keep or slim mirror only for command archive/text use cases

Success criteria:

- mirror is no longer part of AI mode rendering correctness

## Reliability Requirements

This redesign is only acceptable if it improves high-availability behavior in common user workflows.

Required stable workflows:

- dialog to AI mode transition
- AI mode split right / split down
- resize after split
- focus switching between panes
- pane remount after layout change
- session restart
- selection and copy after remount
- long-running Codex/Qwen sessions with frequent redraw

Required failure properties:

- no duplicate replay on remount
- no first-frame contamination on AI mode entry
- no original-pane mutation during split
- no loss of raw CLI semantics due to clipboard/input abstraction

## Testing Strategy

Tests must shift from plain-text replay confidence to runtime lifecycle confidence.

### Unit tests

- runtime lifecycle: create, attach, detach, dispose
- mode orchestration transitions
- split semantics preserving original runtime
- clipboard helper behavior
- archive layer staying command scoped

### Integration tests

- dialog to AI mode without stale background content
- AI mode remount without duplicate screen writes
- split with old pane preserved and new pane fresh
- restart replaces runtime cleanly
- copy/paste remains functional in AI mode after remount

### Regression scenarios

- Codex welcome screen redraw
- Qwen raw-fallback command usage
- long progress-heavy output in neighboring non-AI panes
- repeated focus and resize changes across multiple splits

## Operational Safeguards

To reduce rollout risk, include the following safeguards during migration.

### Feature gating

Enable persistent AI runtime behind a dedicated feature flag at first.

### One-way scope limitation

Migrate AI mode first. Do not force dialog/classic to adopt the same runtime model until AI mode is stable.

### Observability

Add development-time logging around:

- runtime create/dispose
- surface attach/detach
- mode transitions
- copy requests
- session restart events

### Rollback strategy

Keep the old dialog/archive path operational while the new AI runtime path is validated.

## Trade-offs

### Costs

- larger refactor than incremental mirror fixes
- more lifecycle machinery around runtime ownership
- requires stricter separation between archive and live terminal logic

### Benefits

- fixes the real architectural mismatch instead of chasing symptoms
- makes raw-like AI mode stable enough for daily use
- naturally improves copy/paste reliability
- makes split/remount behavior predictable
- aligns better with Warp-like expectations while keeping native CLI semantics

## Open Design Decisions

These are narrow implementation choices, not unresolved product requirements.

- whether the runtime owns the xterm instance directly or owns a terminal-state host abstraction that a surface binds to
- how much selection state should persist across detach/attach versus relying on re-selection after reattachment
- whether ordinary classic mode should eventually share the same runtime path as AI mode or remain separate longer

The recommended implementation path should choose the minimum-complexity option that preserves runtime continuity and avoids reintroducing replay-based restoration for AI mode.

## Recommended Direction

Proceed with an AI-mode-first migration to a persistent runtime architecture.

Do not continue investing in `terminal-screen-mirror` as the primary restoration mechanism for AI mode. Keep text archive logic only where text archive is truly the product.

For raw-fallback AI sessions, the only acceptable source of truth is the live terminal runtime that survives UI remounts.
