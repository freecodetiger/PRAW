# Codex AI Mode Rewrite Design

## Summary

PRAW will rewrite AI mode around a Warp-like single-input interaction model optimized for `codex`, while remaining adaptable to `qwen code` and `claude`.

The decisive product rule is:

- AI mode has exactly one active input surface at a time.
- History never owns the primary input focus.
- The bottom input area is the default owner of interaction.
- Only genuine raw terminal or TUI phases may temporarily take over the bottom area.

This design replaces the current dual-input architecture where:

- the bottom composer exists as one input surface
- a live `xterm` embedded in history exists as another input surface
- the user cannot reliably predict which one actually owns stdin

That architecture is the main reason the current `codex` experience does not feel like Warp.

## Product Goal

PRAW should make `codex` feel like a native AI coding workspace rather than a terminal emulator exposing Codex's own inline TUI.

Success criteria:

- starting `codex` feels like entering a dedicated AI workspace
- while Codex streams, the user can keep typing at the bottom without hunting for focus
- when Codex asks for input, pressing Enter in the bottom input truly sends that input to the active session
- history remains readable and stable
- true terminal takeover only happens for real raw terminal phases, not for ordinary Codex conversation turns

## Why The Current Model Fails

The current architecture still mixes two incompatible ownership models:

1. A transcript-first workspace:
   - prompt blocks
   - assistant blocks
   - run blocks
   - bottom composer

2. A terminal-first execution surface:
   - `WarpTerminalBlock`
   - live `xterm`
   - PTY keyboard focus living inside history

For `codex`, this creates the exact wrong mental model:

- the bottom composer looks primary
- the history terminal is often the real stdin owner
- submitting text from the composer is only a line-write shortcut, not true input ownership
- the user sees duplicate input affordances

Warp avoids this by separating history from the active editor. New execution artifacts appear above the input area, but the active input surface remains singular and legible.

## Scope

This design applies to:

- `codex`
- `qwen code`
- `claude`
- future provider CLIs that behave as AI coding agents

This design does not change the core shell backend requirement:

- PTY sessions remain the execution substrate
- shell continuity remains real
- stdin/stdout/stderr semantics remain real

This design does change the visible product boundary:

- AI mode is no longer a visible terminal surface with a chat overlay
- AI mode becomes a native conversation and execution workspace backed by PTY

## Chosen Approach

The approved approach is:

- rewrite AI mode as a dedicated single-input workspace
- keep PTY as backend transport
- render transcript and execution natively
- only show live terminal takeover in the bottom dock when runtime semantics demand it

This replaces the current `active-process` approach instead of trying to patch it.

## UX Model

### 1. Single primary input surface

AI mode always has one active input owner.

Default:

- the bottom AI composer owns input

Temporary exception:

- a bottom terminal takeover dock owns input during raw-terminal phases

Never allowed:

- a live terminal embedded in history simultaneously acting as another primary input

### 2. Transcript above, input below

The layout has three conceptual regions:

1. Header chrome
   - tab title
   - cwd
   - provider or agent metadata

2. Transcript feed
   - user prompt items
   - assistant response items
   - run cards
   - notices
   - structured command output summaries

3. Bottom interaction dock
   - AI composer in normal mode
   - stdin composer in waiting-input mode
   - live terminal takeover in raw-terminal mode

The bottom interaction dock is persistent and visually anchored.

### 3. Codex session lifecycle

When the user runs `codex`:

1. PRAW detects an AI workflow session.
2. The tab enters `ai-session` view mode.
3. History starts rendering native transcript blocks.
4. The bottom dock becomes the only active input surface.
5. Codex output is projected into transcript items instead of exposed as a live terminal UI.

### 4. Waiting-input behavior

When Codex or another agent is waiting for ordinary line input:

- the bottom dock switches from `agent-prompt` to `agent-stdin`
- placeholder and state chrome change to reflect the target
- Enter sends the current draft to the active PTY session
- history does not spawn a second interactive terminal field

### 5. Raw-terminal takeover behavior

When the agent enters a true terminal-native phase, such as:

- `vim`
- `less`
- `man`
- `top`
- `fzf`
- Python REPL
- password or auth flows requiring raw keystroke semantics

the bottom dock expands into a live PTY terminal surface.

Rules:

- takeover happens in the bottom dock, not in history
- history remains visible above
- exiting raw mode collapses back to the single bottom composer

## Runtime Modes

AI mode will explicitly track a dedicated runtime mode instead of inferring everything from `composerTarget`.

### 1. `agent-prompt`

Meaning:

- the user is talking to the AI workflow normally
- the bottom dock behaves like a modern AI prompt editor

Input semantics:

- Enter submits the draft as agent input
- Shift+Enter inserts a newline if multiline input is supported

### 2. `agent-stdin`

Meaning:

- a running agent session is waiting for line-oriented stdin

Input semantics:

- Enter sends the draft plus newline to the active PTY target
- the draft clears after send
- the dock remains the only active input surface

### 3. `raw-terminal`

Meaning:

- the active workflow requires terminal-native key and cursor semantics

Input semantics:

- the bottom dock hosts a live xterm surface
- keys are forwarded byte-for-byte
- Ctrl+C, Esc, arrows, Tab, paste, mouse, and resize all behave like a real terminal

### 4. `idle-command`

Meaning:

- no agent session is active
- the tab is ready for a normal command launch

Input semantics:

- the bottom dock acts as the command launcher

## State Model

The current `workspace-flow-store` is not expressive enough for this.

Introduce a dedicated AI session state that is separate from generic timeline state.

### `AiSessionState`

Required fields:

- `sessionKind`: `idle` | `agent`
- `agentProvider`: `codex` | `qwen` | `claude` | `unknown`
- `activeRunId`: string | null
- `inputOwner`: `composer` | `terminal-dock`
- `runtimeMode`: `idle-command` | `agent-prompt` | `agent-stdin` | `raw-terminal`
- `dockHeight`: number or preset token
- `pendingDraft`: string
- `transcript`: ordered list of native blocks
- `activeTakeoverRunId`: string | null
- `lastKnownCwd`: string
- `isStreaming`: boolean
- `isWaitingInput`: boolean
- `rawTerminalReason`: semantic reason or null

### `AiTranscriptItem`

Types:

- `user-prompt`
- `assistant-message`
- `run-card`
- `system-note`
- `choice-card`

No `terminal-block` exists as an interactive transcript item in AI mode.

## Component Architecture

### 1. `AiWorkspacePane`

New top-level AI workspace surface.

Responsibilities:

- selects AI session state
- renders transcript
- renders bottom dock
- owns scroll pinning policy
- owns jump-to-active affordances

### 2. `AiTranscript`

Read-only history surface.

Responsibilities:

- render transcript items
- auto-follow while pinned
- stop auto-follow when user scrolls away
- never host the primary interactive PTY surface

### 3. `AiComposerDock`

Bottom interaction host.

Responsibilities:

- render prompt composer
- render stdin composer
- switch into takeover terminal surface
- keep one clear focus owner

### 4. `AiPromptEditor`

Normal AI input editor.

Responsibilities:

- multiline drafting
- suggestion or intent UX
- submit handling
- keyboard policy for AI conversation

### 5. `AiStdinEditor`

Line-oriented stdin editor for waiting-input phases.

Responsibilities:

- direct send-to-PTY semantics
- plain and predictable line input
- explicit status that input is going to the active session

### 6. `AiTerminalDock`

Live xterm host only for raw-terminal phases.

Responsibilities:

- host the active PTY view
- receive all key events
- manage resize and focus
- collapse cleanly when raw mode ends

### 7. `AiRunCard`

Native run visualization.

Responsibilities:

- title
- command
- status
- duration
- output preview
- expanded output
- interrupt or reopen actions

## PTY And Event Projection

### 1. PTY remains authoritative for process semantics

PRAW will not fake execution state.

PTY remains the source of truth for:

- process lifetime
- output
- exit status
- stdin availability
- raw terminal state

### 2. Projection layer becomes AI-specific

Introduce an AI projection layer that converts:

- shell integration events
- terminal semantic events
- output stream chunks
- raw mode transitions

into:

- transcript updates
- dock mode transitions
- input ownership transitions

### 3. Stop rendering visible live xterm during ordinary agent flow

For normal Codex conversation:

- PTY output is parsed and projected
- transcript is rendered natively
- no live history xterm is shown

### 4. Only the dock may host live xterm in AI mode

This is the key architectural constraint.

If a live xterm exists in AI mode, it must be mounted only inside the bottom dock and only while `runtimeMode === raw-terminal`.

## Semantic Detection Rules

The current heuristic model must be strengthened.

### 1. Agent workflow detection

Sources:

- command-entry shell integration events
- known wrapped launch patterns
- terminal semantic detector provider rules

Examples:

- `codex`
- `uvx codex`
- `qwen`
- `qwen code`
- `claude`

### 2. Waiting-input detection

Signals:

- explicit parser event indicating stdin request
- command state transitions already mapped as `run-awaits-input`
- provider-specific prompt markers when necessary

### 3. Raw-terminal escalation

Signals should include:

- alternate screen entry
- mouse-tracking enable
- bracketed paste state with cursor-driven repaint patterns
- application cursor mode
- sustained cursor movement and erase controls without structured agent content
- embedded-terminal semantic events

### 4. Raw-terminal recovery

Recovery when:

- alternate screen exits
- embedded-terminal semantic ends
- command exits or resumes normal line-oriented interaction

## Input Ownership Rules

At any moment, exactly one owner is active.

### Rule 1

When `runtimeMode` is `agent-prompt` or `agent-stdin`, the composer dock owns focus and stdin submission.

### Rule 2

When `runtimeMode` is `raw-terminal`, the terminal dock owns focus and all keyboard input.

### Rule 3

Transcript items are never allowed to own primary focus in AI mode.

### Rule 4

Switching owners must be explicit in state and reflected in the UI.

## Scrolling And Reading Model

### 1. Transcript scroll

Transcript auto-follows while pinned to bottom.

When the user scrolls upward:

- auto-follow stops
- the bottom dock remains visible
- a jump-to-latest affordance may appear

### 2. Dock independence

The dock is layout-stable and independent from transcript height.

Long Codex output must never push the input out of view.

### 3. Takeover scroll behavior

When the dock is in `raw-terminal` mode:

- the transcript remains scrollable above
- the terminal dock has its own internal scroll and PTY viewport behavior

## Visual Direction

The user explicitly wants a harder, denser style.

Requirements:

- no rounded corners
- no decorative color
- monochrome or near-monochrome hierarchy
- high content density
- stable input position
- minimal English helper copy

This should feel closer to:

- Warp's interaction model
- an OpenAI-like modern product shell

but with stricter, sharper visual discipline.

## Migration Strategy

### Phase 1: State split

- introduce `AiSessionState`
- move AI-specific runtime flags out of generic composer-target logic
- preserve existing PTY backend

### Phase 2: New dock architecture

- replace `WarpComposer` for AI tabs with `AiComposerDock`
- add `AiPromptEditor`, `AiStdinEditor`, `AiTerminalDock`

### Phase 3: Transcript replacement

- stop rendering `WarpTerminalBlock` as active input in AI mode
- render native transcript and run cards only

### Phase 4: Semantic takeover

- add stronger raw-terminal escalation and recovery logic
- wire bottom xterm dock only for true raw phases

### Phase 5: Provider adaptation

- validate `codex`
- adapt `qwen code`
- adapt `claude`

## Compatibility Matrix

### Must work

- `codex`
- `uvx codex`
- `qwen`
- `qwen code`
- `claude`
- `git push`
- `sudo`
- password prompts
- `git log`
- `less`
- `vim`
- `python`
- `node`
- `fzf`

### Expected behavior

- ordinary agent conversation stays in native transcript plus bottom composer
- line-based stdin requests stay in bottom stdin editor
- raw CLI tools switch to bottom live terminal dock

## Testing Strategy

### Unit tests

- AI session state transitions
- input owner transitions
- waiting-input routing
- raw-terminal escalation and recovery
- transcript projection

### Component tests

- transcript stays read-only
- dock remains visible during streaming
- Enter in `agent-stdin` truly routes to PTY sender
- raw-terminal mode mounts dock xterm and removes composer ownership

### Integration tests

- launch `codex`, stream output, submit follow-up from dock
- launch `codex`, hit waiting-input state, send stdin from dock
- launch `codex`, enter `git log`, verify bottom takeover terminal
- exit raw mode, verify dock collapses back to composer

## Risks

### 1. Semantic ambiguity

Some CLIs may blur the line between line-oriented input and raw interaction.

Mitigation:

- make takeover state explicit and test against real sessions
- add provider-specific adapters only where generic detection is insufficient

### 2. Partial migration complexity

Mixing old AI surfaces with new dock ownership would recreate the same confusion.

Mitigation:

- once AI mode is migrated, remove active transcript terminal ownership entirely

### 3. Provider divergence

`codex`, `qwen`, and `claude` may emit different interaction patterns.

Mitigation:

- keep one shared state machine
- isolate provider quirks in adapters or semantic rules

## Decision

PRAW will treat AI mode as its own product surface.

For AI sessions:

- transcript is native and read-only
- the bottom dock is the only default input surface
- live terminal rendering is allowed only as a bottom takeover dock during real terminal-native phases

This is the design direction that gives PRAW the best chance of genuinely matching Warp-level AI coding ergonomics instead of simulating them with terminal patches.
