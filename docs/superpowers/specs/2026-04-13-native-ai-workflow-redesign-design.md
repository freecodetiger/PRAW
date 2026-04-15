# Native AI Workflow Redesign

## Summary

This redesign replaces the current AI workflow rendering model with a native PRAW experience that is visually and behaviorally closer to Warp.

The key product decision is:

- AI mode will no longer visually mirror the Codex/Qwen/Claude CLI TUI.
- PTY sessions remain the execution substrate.
- PRAW becomes the renderer of AI conversation, execution flow, run state, and user input affordances.

This is not a flicker patch. It is an architectural replacement of the AI-mode presentation layer.

## Why The Current Architecture Fails

Codex and similar AI CLIs emit a repaint-heavy inline TUI even when alternate screen is disabled. Their output includes:

- cursor jumps
- erase-in-line / erase-in-display
- scroll-region updates
- spinner refreshes
- title updates
- synchronized output bursts

As long as PRAW exposes that TUI as a visible terminal surface, flicker remains structural. Replacing xterm rendering details or replay mechanics can reduce symptoms, but cannot deliver a stable Warp-like experience.

Therefore, the correct fix is to stop treating AI workflow as a terminal UI that must be faithfully shown to the user.

## Product Direction

### 1. AI mode becomes a native conversation surface

Each AI tab remains backed by a PTY session, but the visible surface becomes a native PRAW interface:

- user prompts render as prompt bubbles or prompt rows
- assistant output renders as stable streaming message blocks
- tool and command executions render as first-class run cards
- status, provider, cwd, and task state render in native pane chrome

The AI CLI continues running beneath the surface, but its repaint loop is not directly exposed visually.

### 2. Single-feed layout

The visible layout is a single vertical conversation feed:

- prompt blocks
- assistant response blocks
- inline run cards
- follow-up result blocks

This keeps the interface close to Warp AI:

- one primary reading path
- no split terminal-vs-chat ownership confusion
- execution history remains embedded inside the conversation timeline

### 3. Large inline run cards

When the AI executes a command or tool step, PRAW inserts a run card into the feed.

Each run card may contain:

- command or tool title
- running / waiting / completed / failed status
- timestamps or duration
- expandable output region
- interruption and copy controls
- retry / reopen actions where appropriate

The run card is allowed to be large and readable. This is intentional. It should feel like a first-class execution artifact, not a collapsed debug detail.

### 4. Bottom composer stays fixed at all times

The user explicitly wants input to remain anchored at the bottom even while AI is producing long output.

Therefore:

- the bottom composer remains permanently visible
- the visible input location never moves into the conversation feed
- the user never needs to scroll to the latest message in order to type

This differs from the previously considered “input inside run card” model, which is now rejected.

### 5. Intelligent input routing

The bottom composer routes input based on runtime context:

- when no task is waiting for stdin, it behaves as a normal AI prompt composer
- when a running task is waiting for stdin, it switches into task-input mode
- task-input mode sends the submitted text to the active PTY instead of creating a new AI prompt

The visible UI should make that routing explicit, for example:

- `Ask AI`
- `Send to running task`
- `Continue process input`

The user still types at the same fixed bottom position. Only routing changes.

### 6. AI-mode terminal fidelity boundary

AI mode is no longer responsible for reproducing full CLI terminal visuals.

Preserved:

- PTY stdin/stdout/stderr semantics
- interrupt behavior
- password prompt / echo-off behavior
- command lifecycle
- shell process continuity

Not preserved as a product goal:

- raw cursor choreography
- CLI-specific inline spinners
- direct visual reproduction of the vendor TUI
- terminal repaint identity

This is an intentional tradeoff in favor of stability, readability, and product coherence.

## Technical Design

### 1. Separate execution substrate from presentation

Current coupling is too tight:

- PTY stream
- terminal replay buffer
- xterm surface
- visible AI experience

These must be separated.

The new model should introduce a dedicated AI workflow projection layer:

- raw PTY stream remains low-level execution truth
- shell / workflow events are parsed into structured runtime events
- structured events feed a native AI view model
- React renders the view model, not the terminal screen

This is the core architectural inversion.

### 2. Introduce an AI workflow event model

The PTY-backed AI session should project into higher-level events such as:

- prompt submitted
- assistant stream chunk
- run started
- run output appended
- run awaiting input
- run completed
- run failed
- task interrupted
- provider / model status changed

These events become the only source for AI-mode UI rendering.

The goal is to remove visible dependence on terminal cell replay for AI tabs.

### 3. Introduce a dedicated AI workflow state store

The existing terminal dialog state is optimized for shell transcript and classic handoff, not for a full AI-native interaction model.

A dedicated AI workflow state should track:

- conversation items
- active streaming assistant item
- run card registry
- active stdin target
- pending interrupt state
- provider / model metadata
- UI affordances such as expanded or collapsed runs

This store should remain independent from classic terminal replay state as much as possible.

### 4. Keep PTY routing but stop exposing repaint loops

The PTY session remains the backend transport. However:

- AI output must no longer be rendered through visible xterm
- a hidden parser may still exist transiently if needed for decoding control flows
- visible rendering must come from structured AI-state projections

If xterm remains in the stack at all, it should only serve as an off-screen parsing helper during migration, not the visible surface.

### 5. Define run-card output policy

Run cards should support two layers of output:

- stable preview in the feed
- expandable detailed output region

For long-running or noisy tasks:

- the card stays stable in place
- new output appends without moving the global input location
- the user can continue typing at the bottom composer

This prevents the “follow the cursor to the end of the transcript” problem.

### 6. Input-mode switching

Bottom composer should expose one stable control surface with multiple runtime modes:

- AI prompt mode
- PTY stdin mode

Mode switching rules:

- if no run is currently awaiting input, composer defaults to AI prompt mode
- if a run enters an input-waiting state, composer visually switches to stdin mode
- user submission goes to the active run
- once the run resumes or exits, composer returns to AI prompt mode

This mode switch must be explicit in the UI but should not feel disruptive.

### 7. Interaction controls

AI mode should expose native controls instead of relying on CLI keybindings:

- interrupt current run
- retry last run
- copy block
- expand / collapse output
- jump to active run
- reopen completed output

These controls should live in PRAW-owned UI elements, not terminal shortcuts.

### 8. Provider-agnostic AI shell

The visual AI workflow must work the same way for:

- Codex
- Qwen
- Claude

Provider-specific CLIs should become backend adapters, not visible UX owners.

This redesign creates the correct abstraction boundary for the provider work that already exists elsewhere in the project.

## UX Style

The chosen visual direction is:

- minimal
- precise
- professional
- modern

This means:

- restrained color system
- calm chrome
- high legibility
- clear information hierarchy
- no exaggerated sci-fi effects

The experience should feel premium and intentional, not noisy.

## Migration Strategy

### Stage 1

Introduce the AI workflow projection model beside the existing terminal dialog/classic infrastructure.

### Stage 2

Route Codex AI tabs to the native AI renderer while preserving the existing PTY backend.

### Stage 3

Port Qwen and Claude onto the same renderer.

### Stage 4

Remove visible dependence on xterm for AI workflow tabs entirely, retaining classic xterm only for true terminal use cases.

This staged approach allows migration without destabilizing classic terminal behavior.

## Testing

### Behavior tests

- AI output no longer flickers during Codex streaming
- bottom composer remains visible while long assistant output streams
- input submitted during stdin-wait routes to the active task rather than creating a new AI prompt
- after stdin-wait clears, composer returns to AI prompt mode
- run cards append output without moving the composer location
- interrupt actions terminate the active PTY-backed task correctly

### Rendering tests

- assistant stream updates only the active assistant block
- run output updates only the target run card
- expanded and collapsed output states remain stable across rerenders

### Regression tests

- classic mode still behaves as a real terminal
- dialog mode for ordinary shell commands still behaves as designed
- AI provider switching still works

## Recommendation

Proceed with a full native AI workflow rewrite.

Do not continue investing in “visible terminal stabilization” for AI-mode CLIs.

That path cannot achieve the requested Warp-like quality bar because the flicker originates from the vendor CLI repaint model itself, not from a single rendering bug inside PRAW.
