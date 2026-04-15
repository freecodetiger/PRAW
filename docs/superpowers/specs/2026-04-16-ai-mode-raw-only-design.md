# AI Mode Raw-Only Consolidation Design

## Summary

PRAW will keep the current `AI MODE` shell and auxiliary prompt capsule, but the runtime beneath AI mode will become raw-terminal-only.

This means:

- all AI providers default to the same raw terminal interaction model
- all structured provider bridges and structured AI transcript rendering are removed
- the visible AI experience keeps PRAW chrome, but the terminal remains the single source of truth
- provider-native commands such as `/resume`, `/model`, and `/review` return to the native CLI instead of being reimplemented by PRAW

This is an architectural simplification project, not a small bug patch.

## Product Goal

AI mode should feel like one consistent native PRAW workspace around a real terminal, not two competing runtimes mixed together.

Success means:

- entering `codex`, `qwen`, or `claude` always produces the same PRAW AI-mode frame
- the main interaction surface is always the real raw terminal
- the prompt capsule remains available as a side input, but never replaces the real CLI input
- copy, paste, scrollback, selection, and pane restoration all work against the raw terminal buffer
- PRAW no longer interprets provider-native AI commands in a separate structured layer

## User-Approved Constraints

The user explicitly approved these product constraints:

- `AI MODE` stays as a visible product mode
- the current pane chrome, AI badge, and prompt trigger remain
- the prompt capsule stays, but it is only a bypass input
- the true provider CLI input remains the primary input surface
- PRAW should not provide extra graphical affordances for `/resume`, `/model`, or `/review`
- every provider should default to raw terminal interaction, not structured bridges
- removing structured code is preferred over keeping dead compatibility layers

## Why The Current Architecture Fails

The current design mixes two incompatible ownership models:

- a raw PTY terminal that owns actual provider behavior
- a structured AI bridge that tries to reinterpret provider behavior as PRAW-native chat state

This has created repeated architectural failures:

- providers behave differently depending on whether they are on the structured or raw path
- raw-fallback and structured mode each try to own the same session in different ways
- replay logic, terminal guards, and AI-mode remounts can leak terminal probe traffic back into visible output
- users must reason about whether a command is “native CLI” or “PRAW structured”
- PRAW-maintained command semantics drift away from the provider’s own CLI semantics

The recent Codex regression is a direct example of this split architecture. AI mode preserved the outer shell, but the runtime internally still relied on raw-fallback plus replay plus terminal query guards, which let protocol responses leak into visible terminal state.

The right fix is to remove the dual-runtime model entirely.

## Approaches Considered

### 1. Keep Structured Mode And Patch Raw-Fallback

Continue maintaining structured bridges for providers, but fix replay and fallback bugs.

Pros:

- smaller immediate code change
- keeps PRAW-owned session commands such as graphical resume

Cons:

- preserves the root cause: two competing interaction models
- keeps provider-specific branching in both frontend and backend
- keeps future regressions likely because state ownership remains split

Rejected because it does not solve the architecture.

### 2. Force All Providers To Raw-Fallback But Leave Structured Code In Place

Route all providers to raw terminal mode, but keep structured code dormant behind the scenes.

Pros:

- lower short-term refactor risk
- smaller visible behavior change during rollout

Cons:

- leaves a large dead subsystem in the codebase
- future debugging remains confusing because obsolete abstractions still exist
- encourages accidental reconnection of structured code later

Rejected because it is incomplete cleanup.

### 3. Remove Structured Runtime And Keep AI Mode As A Raw-Terminal Workspace

Keep the AI-mode visual shell, but make the raw terminal the only runtime.

Pros:

- one source of truth for provider interaction
- far simpler state model
- native provider semantics are preserved
- eliminates structured/raw divergence
- directly aligns with the user’s preferred interaction style

Cons:

- removes PRAW-owned graphical AI command helpers
- requires coordinated cleanup across frontend and Tauri backend

Chosen approach.

## Chosen Architecture

### 1. AI Mode Becomes A Raw-Terminal Workspace

`AI MODE` remains a PRAW presentation mode, not a structured execution mode.

Rules:

- when semantic detection marks a session as `agent-workflow`, the pane uses AI-mode chrome
- the visible execution surface is always a raw `xterm`-backed terminal
- there is no separate structured transcript surface
- there is no secondary “expert drawer” for the real terminal, because the real terminal is already the main surface

The product distinction becomes:

- classic or dialog mode for ordinary shell work
- AI mode for AI CLI workflows

But both still rely on the same raw terminal substrate.

### 2. The Raw Terminal Is The Only Execution Truth

All provider I/O, scrollback, selection, copy behavior, prompt visibility, and state restoration must derive from the raw terminal.

Rules:

- no AI-mode DOM transcript owns the conversation
- no structured assistant-message stream is treated as the visible source of truth
- no provider-specific structured command transport exists
- all terminal restoration and scrollback behavior must be compatible with raw PTY ownership only

This allows copy/paste and terminal fidelity to stay aligned with the real session rather than a projected transcript.

### 3. The Prompt Capsule Stays As A Side Input

The prompt capsule remains because the user explicitly wants a bypass input when the real CLI input scrolls out of view.

Rules:

- the capsule appears in AI mode regardless of provider
- clicking it opens the auxiliary input surface
- submitting the capsule sends text directly into the real provider CLI input path
- success collapses the auxiliary input back to its resting state
- the capsule never replaces the real terminal input model

The capsule is a convenience feature layered on top of the terminal, not an alternative runtime.

### 4. Provider-Native Commands Return To Native CLI Ownership

PRAW no longer reimplements provider-native AI commands.

Examples:

- `/resume`
- `/model`
- `/review`
- provider-specific slash commands

Rules:

- PRAW does not parse them into structured actions
- PRAW does not offer a graphical resume picker
- PRAW does not expose provider capability matrices for AI commands
- if the user wants those commands, they use the real CLI in the real terminal

This keeps semantics aligned with the provider and removes PRAW-owned drift.

### 5. Semantic Detection Still Matters, But Only For Presentation

AI command detection remains valuable, but its job becomes much narrower.

It should only decide:

- whether a pane should enter `AI MODE`
- which provider label or badge to show
- whether AI-only chrome such as the capsule should be available

It should not decide:

- whether the runtime is structured or raw
- whether provider commands should be intercepted
- whether output belongs to transcript projection or terminal replay

This keeps semantic detection useful without letting it own transport.

## Frontend Design

### 1. Collapse AI-Mode Rendering To One Surface

The current AI-mode rendering stack will be simplified:

- remove structured transcript rendering as the main AI surface
- remove structured composer as the primary AI input
- remove the split between “structured surface” and “bootstrap raw terminal”
- render one raw terminal surface inside the AI-mode shell

The result is a single visible flow:

- pane header with AI chrome
- raw terminal content area
- prompt capsule trigger

### 2. Remove Structured Composer And Command Parsing

The frontend currently contains structured AI command parsing and provider capability branching.

That layer will be removed.

Consequences:

- no structured `/help`, `/new`, `/resume`, `/review`, `/model` handling in `TerminalPane`
- no structured prompt submission transport
- no capability-driven placeholder or help text for provider slash commands
- no provider-specific structured system messages

The only AI submission paths that remain are:

- typing directly in the real terminal
- sending text through the capsule to the real terminal

### 3. Keep AI Mode Chrome And Capsule Triggers

The pane should still visually communicate that the current workflow is an AI CLI session.

Keep:

- `AI MODE` badge
- prompt trigger button in pane chrome
- capsule overlay
- AI-mode-specific visual styling

Remove:

- expert drawer controls
- structured resume picker
- structured composer footer
- structured empty-state transcript copy

### 4. Simplify Terminal View State

Terminal view state should no longer track structured AI bridge lifecycle as a primary runtime abstraction.

Expected simplifications:

- remove structured/raw-fallback bifurcation from AI pane behavior
- reduce `agentBridge` state to minimal presentation metadata or remove it entirely if semantic metadata can replace it
- keep only the state needed for AI-mode shell presentation and capsule availability

The guiding rule is that state should answer presentation questions, not transport questions.

## Backend Design

### 1. Remove Structured Agent Control Plane

The Tauri backend currently contains a structured agent bridge, provider adapters, and command RPCs for structured AI control.

That subsystem will be removed.

Delete:

- structured provider adapter contract
- structured runtime execution path
- structured bridge socket host
- provider-specific structured adapters
- structured AI control commands exposed to the frontend

Keep:

- PTY-backed terminal sessions
- shell integration wrappers that launch provider CLIs
- semantic detection that marks provider sessions as AI workflows
- Codex session listing or review helpers only if they still serve non-AI-mode workflows elsewhere; otherwise remove them too

### 2. Keep AI Wrapper Entry But Make It Raw-Only

The shell wrapper around `codex`, `qwen`, and `claude` still matters because it provides provider detection and launch indirection.

However, after this redesign:

- wrappers no longer host structured bridge processes
- wrappers launch provider CLIs directly in the PTY
- passthrough arguments do not change runtime ownership because raw terminal ownership is always the default

This removes the current “structured unless fallback” branching entirely.

### 3. Remove Structured Frontend RPCs

Frontend APIs that exist only for structured AI control should be removed from both sides of the Tauri boundary.

Examples include:

- submit prompt through structured bridge
- reset structured AI session
- attach structured session
- set model override through bridge

If any helper remains, it must be justified independently of structured runtime ownership.

## Data Flow

After the redesign, AI-mode data flow becomes straightforward:

1. user launches `codex`, `qwen`, or `claude` in the shell
2. semantic detection recognizes the workflow and marks the pane as AI mode
3. terminal output continues to stream into the raw terminal buffer
4. the user interacts either through the terminal itself or the capsule
5. capsule submission writes text into the same live terminal session
6. copy, paste, selection, and scrollback all operate on the raw terminal state

There is no alternate structured message stream competing for ownership.

## Error Handling

### 1. Provider Startup Errors

If the provider fails to launch, the pane should behave like a normal terminal failure:

- show terminal output or shell error naturally
- let the terminal session remain inspectable
- do not surface structured bridge errors, because there is no structured bridge anymore

### 2. Capsule Submission Errors

If capsule submission fails:

- keep the draft
- show a local PRAW error state near the capsule
- do not claim the prompt was sent

This remains a UI-layer concern only.

### 3. AI-Mode Detection Errors

If semantic detection misses a provider launch:

- the pane may stay in normal terminal mode temporarily
- terminal behavior remains correct because runtime ownership is still raw terminal

This is a presentation miss, not a transport failure.

That makes the system safer than the current design, where detection can affect runtime ownership.

## Testing Strategy

### 1. Frontend Regression Coverage

Tests should verify:

- AI mode renders one raw terminal surface instead of a structured transcript surface
- the capsule still appears in AI mode for supported providers
- capsule submission routes to terminal transport, not structured transport
- pane chrome still shows AI mode labels
- removing structured commands does not break normal pane interaction

### 2. Backend Regression Coverage

Tests should verify:

- shell wrappers still classify `codex`, `qwen`, and `claude` as AI workflows
- provider launch always stays on raw terminal execution
- no structured bridge socket or adapter path remains reachable
- removed structured commands are no longer exported through Tauri

### 3. User-Facing Regression Coverage

The highest-value integration regressions are:

- launch `codex` with passthrough flags and confirm AI mode still works as a raw terminal
- confirm no probe-response garbage leaks into visible output after remount
- confirm selecting and copying text from AI mode still works
- confirm splitting and returning to an AI pane preserves the raw terminal session instead of replacing it with a fake transcript

## Migration Notes

This refactor intentionally deletes user-facing behavior:

- structured composer help
- structured command interception
- graphical session resume picker
- provider capability-specific structured affordances

That is acceptable because the approved product direction explicitly prefers raw CLI fidelity over structured PRAW semantics.

The cleanup should be performed as one coordinated migration rather than as a long-lived compatibility phase. Leaving both systems in place would reintroduce the same ambiguity this redesign is trying to remove.
