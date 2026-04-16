# Terminal Screen Mirror Design

## Summary

PRAW will introduce a headless terminal screen mirror as the single source of truth for each tab's runtime state.

This mirror will own:

- the current rendered screen
- scrollback history
- viewport position
- text export for transcript archival

Mounted `xterm` instances will become presentation and interaction clients of that mirror instead of acting as the source of truth themselves.

This is an architectural correction. It is intended to eliminate a class of state-loss, remount, and transcript race bugs rather than patching individual symptoms.

## Product Goal

Terminal behavior should remain stable across:

- splitting panes
- switching panes
- remounting terminal surfaces
- entering and leaving AI mode
- long-running commands with progress redraws
- copying selected text from both normal shell workflows and AI CLI workflows

Success means:

- splitting a pane does not mutate the original pane's visible state
- the original pane can still scroll upward to inspect prior output after the split
- AI mode preserves the real CLI experience while remaining copyable and scrollable
- fast commands such as `ls` never lose their final output
- progress-heavy commands such as `git clone` archive only the final stable visible result

## User-Approved Requirements

The user explicitly wants the architecture to guarantee:

- original pane state is preserved after split
- prior output remains recoverable through scrollback
- copy and paste work in AI mode and normal terminal workflows
- raw CLI interaction remains the primary model for AI providers
- future fixes should improve maintainability instead of adding more ad hoc patches

## Why The Current Model Fails

Today terminal state is split between two incompatible representations:

1. raw PTY bytes accumulated into replay text
2. rendered `xterm` screen text exported asynchronously after parsing

This causes structural problems:

- remount restoration replays raw bytes that are not a stable description of the visible screen
- alternate-screen and cursor-control heavy CLIs can rehydrate into corrupted or stale-looking output
- transcript finalization races against `xterm`'s asynchronous parsed-write lifecycle
- UI mount state influences whether archival state is current
- pane split and mode changes can accidentally reset or visually disturb the prior pane

The result is exactly the class of bugs already observed:

- AI mode first paint shows stale or garbled background residue
- command output can be swallowed for short-lived commands
- progress updates can either spam history or disappear incorrectly
- scroll position and visible state feel fragile across layout operations

## Approaches Considered

### 1. Keep Patching Replay And Archive Timing

Continue refining raw replay and end-of-command archival timing.

Pros:

- smallest code change
- lowest immediate migration cost

Cons:

- preserves split ownership
- remains timing-sensitive
- does not give pane remounts a true stable source of truth

Rejected because it treats symptoms instead of state ownership.

### 2. Make The Mounted Xterm The Sole Runtime Authority

Treat the currently mounted `xterm` instance as the only authoritative screen model and derive replay/export from it.

Pros:

- simpler than a full mirror
- leverages `xterm`'s existing terminal emulation

Cons:

- authority still depends on a mounted UI instance
- hidden panes and remount transitions still need fragile coordination
- archival and scrollback logic remain coupled to component lifecycle

Rejected because it improves the current architecture but does not truly decouple runtime state from UI state.

### 3. Introduce A Headless Screen Mirror

Maintain a per-tab mirror that consumes PTY output independently of the mounted UI surface.

Pros:

- one authoritative runtime state per tab
- remounts and splits no longer threaten state integrity
- archival and replay come from the same stable source
- AI mode and dialog mode can share the same terminal substrate

Cons:

- largest refactor
- requires careful migration of replay, viewport, archive, and selection semantics

Chosen approach.

## Chosen Architecture

### 1. One Runtime Authority Per Tab

Each terminal tab will own a `TerminalScreenMirror`.

The mirror is responsible for:

- consuming PTY output in arrival order
- maintaining the current rendered screen state
- maintaining scrollback
- tracking viewport state
- exposing stable text snapshots for history/transcript usage

The mirror persists independently from React component mount state.

### 2. Mounted Xterm Becomes A View Layer

`XtermTerminalSurface` will no longer be responsible for reconstructing state from accumulated raw PTY bytes.

Instead it will:

- subscribe to the mirror for initial hydration
- apply incremental updates from the mirror while mounted
- forward keyboard, paste, and selection interactions
- report viewport changes back to the mirror

The visible terminal is still an `xterm`, but it is no longer the system of record.

### 3. Replay, Archive, And Scrollback Come From The Same Model

The mirror will expose three related but distinct outputs:

- screen replay snapshot
  - used to hydrate a remounted `xterm`
- scrollback model
  - used to restore viewport and allow upward scrolling after remount
- exportable text snapshot
  - used to finalize command history blocks and AI transcript archival when needed

These are all derived from one underlying terminal model instead of competing sources.

### 4. Pane Split Must Be Purely Additive

Splitting a pane should create a new tab and session without mutating the original tab's mirror.

Rules:

- the original tab keeps its mirror untouched
- the original tab keeps its scrollback untouched
- the original tab keeps its viewport state untouched
- the new split starts with a fresh mirror
- focus may move to the new pane, but the old pane's state must remain intact

This restores the expected mental model: split creates a second workspace, it does not relocate the first one.

### 5. AI Mode Uses The Same Mirror Substrate

AI mode remains a raw terminal workflow.

Under this design:

- Codex, Claude, and Qwen all use the same mirror-backed raw runtime
- the capsule stays only as a side-input helper
- copy, paste, selection, and scrollback in AI mode are backed by the same terminal mirror as any other shell session

This avoids a second state model for AI workflows.

## Mirror Responsibilities

The mirror must provide at least these capabilities:

### Screen State

- visible rows and columns
- cursor-aware rendering state
- handling of carriage returns, line feeds, erase operations, and common cursor movement
- alternate-screen transitions or an explicit normalization strategy for them

### Scrollback State

- stable retained history beyond the current visible viewport
- scroll position tracking
- restoration of the prior viewport on remount

### Export State

- stable plain-text export of the current visible or archived command result
- conservative trailing-whitespace trimming
- normalized line endings suitable for transcript/history display

### UI Coordination State

- current viewport line
- current size information needed for reflow or rehydration decisions
- change notifications for mounted terminal views

## Data Flow

### PTY Output Path

1. Backend emits PTY output for a session.
2. Frontend runtime routes output to the tab's screen mirror.
3. The mirror updates its internal terminal model.
4. Any mounted terminal view receives incremental updates from the mirror.
5. Dialog-mode parsers still consume shell markers for command lifecycle and cwd tracking, but transcript text is no longer reconstructed from a separate authority.

### Remount Path

1. A pane remounts because of split, focus changes, resize, or mode transition.
2. `XtermTerminalSurface` requests the current replay snapshot and viewport from the mirror.
3. The terminal view hydrates from that stable snapshot.
4. The prior viewport is restored.
5. New PTY output continues through the mirror without any special-case remount logic.

### Command Completion Path

1. Shell integration emits `command-end`.
2. Dialog state resolves the active command block.
3. Terminal history export is pulled from the mirror, not from mounted `xterm` lifecycle callbacks.
4. The command block receives the final stable text.

This removes the race between output arrival and `onWriteParsed`.

## Module Changes

### `src/features/terminal/lib/terminal-registry.ts`

Replace the current snapshot model with a terminal runtime registry that owns:

- the active mounted controller, if any
- the persistent screen mirror for the tab
- viewport metadata
- export helpers

The existing raw `content` replay buffer should be retired.

### `src/features/terminal/components/XtermTerminalSurface.tsx`

Refactor the component so it:

- hydrates from mirror state rather than replaying raw PTY bytes
- stops treating the mounted terminal as the archival authority
- reports viewport changes to the mirror
- remains the UI endpoint for direct input and selection

### `src/features/terminal/hooks/useTerminalRuntime.ts`

Change output routing to:

- feed PTY output into the screen mirror first
- let dialog shell parsing consume the same chunk for lifecycle semantics
- stop assuming mounted `xterm` parsed-write timing is needed for final archive correctness

### `src/features/terminal/state/terminal-view-store.ts`

Keep dialog and AI presentation state, but remove responsibility for reconstructing final terminal text from asynchronous `xterm` exports.

Command completion should read export text from the mirror-owned terminal state.

### `src/features/terminal/components/AiWorkflowSurface.tsx`

No product-level redesign is required, but it should rely entirely on the shared mirror-backed raw terminal substrate.

## Migration Strategy

### Phase 1. Introduce Mirror Types Behind The Existing Registry Boundary

- add mirror state and APIs without changing all callers at once
- preserve existing controller registration so the UI still works during the transition
- add tests for mirror hydration, viewport persistence, and export behavior

### Phase 2. Move Replay Hydration To Mirror Snapshots

- stop hydrating remounts from raw `snapshot.content`
- hydrate from stable mirror replay state instead
- verify AI mode first-paint correctness and split/remount behavior

### Phase 3. Move Command Archive Export To Mirror State

- stop relying on `xterm` `onWriteParsed` timing for final command output
- finalize command blocks from mirror exports
- verify fast-command correctness and progress-heavy command correctness

### Phase 4. Remove Obsolete Raw Replay Paths

- delete the raw accumulated replay buffer
- delete dead compatibility code that only exists to reconcile dual authorities
- keep the runtime boundary narrow and explicit

## Error Handling

If a mirror update fails:

- the session must continue running
- mounted `xterm` should still receive live output if possible
- command lifecycle state must not be left permanently running
- fallback export may be empty, but state must remain internally consistent

If a terminal view remounts while no controller is attached:

- the mirror remains intact
- hydration occurs when a view attaches again

## Testing Strategy

### Mirror Unit Tests

- PTY chunks update screen state deterministically
- carriage-return progress updates collapse to the latest visible line
- fast command output is exportable immediately at command end
- viewport state survives detach and reattach

### Runtime Integration Tests

- splitting a pane leaves the original tab's screen and viewport unchanged
- remounting an AI pane restores prior visible content without garbled replay
- `ls` and similar quick commands archive correct final output
- `git clone` archives the final visible progress result without history spam

### UX Regression Tests

- AI mode selection remains copyable
- scrollback remains available after pane split
- prompt capsule submission still writes into the real raw terminal path

## Non-Goals

This design does not attempt to:

- redesign pane split UX
- introduce a structured AI transcript runtime again
- make the capsule the primary AI input
- preserve every transient intermediate repaint frame in archived history

## Open Technical Decision

The key implementation choice inside the mirror is whether to:

- embed an off-DOM `xterm` instance as the headless parser, or
- introduce a dedicated terminal buffer model that PRAW owns

For this project, the recommendation is to prefer an off-DOM `xterm`-backed mirror first.

Reason:

- it minimizes terminal emulation drift
- it reuses the exact parser already trusted in the mounted UI
- it achieves the architectural goal without forcing PRAW to become a terminal emulator project

If that proves insufficient, a dedicated buffer model can be considered later. It should not be the first move.
