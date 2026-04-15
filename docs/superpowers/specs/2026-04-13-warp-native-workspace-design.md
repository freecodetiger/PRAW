# Warp-Native Workspace Design

## Summary

PRAW will be redefined as a single-mode Warp-like command workspace.

This replaces the current multi-mode terminal model with one unified interaction system:

- no `classic`
- no `dialog/classic` mode switching
- no visible dependency on vendor CLI TUI rendering for AI workflows
- one native workspace built around a fixed bottom composer and a single conversation/execution timeline

The user explicitly wants the product to converge on Warp-like interaction and product quality. This design therefore stops treating the old terminal UI as a product boundary and instead treats terminal execution as a backend capability.

## Product Goal

PRAW should behave like a modern command workspace with AI-native interaction.

That means:

- one stable UI model
- one visual language
- one primary reading path
- one primary input location
- terminal execution as infrastructure, not as the visible product shell

The product should feel closer to OpenAI/Warp style software than to a traditional terminal emulator with an AI overlay.

## Why The Current Model Must Be Replaced

The current architecture is still built around visible terminal ownership:

- terminal surfaces decide too much of the experience
- AI workflows inherit vendor CLI repaint behavior
- user input location can drift with execution state
- the product feels like two systems stitched together

This breaks the quality bar in three ways:

1. Flicker remains structural when vendor CLIs repaint aggressively.
2. The interface cannot become truly Warp-like while terminal surfaces remain the visible center of gravity.
3. The existence of `classic` and terminal-mode switching prevents the product from converging on one coherent mental model.

Therefore, the right solution is not further terminal stabilization. The right solution is product architecture replacement.

## Product Architecture

### 1. Single-mode workspace

The application has exactly one interaction mode:

- `Warp-native workspace`

The old concepts below are removed from the user-facing product:

- classic mode
- dialog mode as a separate conceptual mode
- explicit mode switching between terminal experiences

There is only one visible workspace model.

### 2. Fixed global composer

The bottom composer is the global primary input surface at all times.

This is the most important interaction rule in the system.

Requirements:

- it is always visible
- it does not move into the timeline
- it does not disappear during long output
- it remains usable while AI is streaming
- it remains usable while commands are running

The user should never need to scroll to the latest message in order to type.

### 3. Single vertical timeline

The middle area of the workspace is a single vertical feed.

It contains:

- user prompts
- assistant responses
- command execution blocks
- tool result blocks
- system notices
- embedded terminal blocks when needed

Everything important appears in one reading flow. The interface should never split into “chat here, terminal there” as the primary interaction model.

### 4. Terminal as backend, not shell

PTY sessions remain critical, but they are no longer the visible product shell.

Terminal execution is kept for:

- stdin/stdout/stderr semantics
- shell continuity
- interactive command execution
- real TUI programs where necessary

But terminal visuals do not define the AI experience anymore.

## Information Architecture

The workspace timeline is built from a single block system.

### 1. `prompt-block`

Represents a user-authored input item.

Examples:

- an AI question
- a direct command request
- a follow-up instruction

### 2. `assistant-block`

Represents a stable streaming or completed AI response.

This block is rendered natively by PRAW and must never expose vendor CLI repaint loops directly.

### 3. `run-block`

Represents a concrete execution step.

Examples:

- shell command execution
- provider tool invocation
- agent-produced action step

It may contain:

- title
- state
- duration
- summary
- output preview
- expanded output region
- control actions

### 4. `choice-block`

Represents suggested next actions.

Examples:

- run suggestion
- apply fix
- retry
- inspect diff

### 5. `terminal-block`

Represents a real embedded native terminal area used only when necessary.

This block exists for:

- `vim`
- `less`
- `man`
- `top`
- other genuine TUI or high-interaction terminal programs

This does not reintroduce classic mode. It is a block type inside the unified workspace.

### 6. `system-block`

Represents system-level status or control information.

Examples:

- provider connection issues
- permission requests
- interrupted run notices
- environment warnings

## Input And Focus Model

### 1. One primary input location

The bottom composer is the only default input destination.

It remains primary across:

- AI streaming
- command execution
- tool execution
- run output growth

### 2. Composer routing modes

The composer has multiple routing modes, but one visual position:

- `Ask AI`
- `Run command`
- `Send to active process`

Mode selection should be automatic from context, but visually explicit.

### 3. Stdin routing

When a running process requires input:

- the composer remains at the bottom
- the timeline does not take over primary input
- the composer switches into `Send to active process`
- submitted text is written to the active PTY target

When the process no longer needs input:

- the composer returns to its normal AI or command mode

### 4. Embedded terminal focus

`terminal-block` can receive keyboard input, but only when explicitly focused by the user.

Rules:

- clicking the terminal block can temporarily give it keyboard ownership
- returning to the composer restores global input ownership
- embedded terminal focus is opt-in, not the default workspace state

This preserves real TUI usability without breaking the workspace-wide interaction model.

## Visual Design Direction

The chosen style direction is:

- modern
- minimal
- professional
- product-like
- closer to OpenAI product polish than to legacy terminal aesthetics

This implies:

- restrained color palette
- strong typography hierarchy
- stable spacing
- quiet pane chrome
- clear states and affordances
- no exaggerated terminal nostalgia

The interface should feel like a contemporary software product, not a themed terminal emulator.

## Execution Blocks

### 1. Large inline run blocks

Execution blocks are first-class objects in the timeline.

They may be visually large and are allowed to hold:

- real-time output
- progress state
- completion summaries
- controls

They should not look like a fake terminal wedge. They should look like native execution objects.

### 2. Output policy

Each `run-block` has:

- stable summary surface
- expandable detailed output region

Long output must:

- grow inside the run block
- avoid moving the global composer
- remain readable
- support expansion and collapse

### 3. Controls

Run blocks should expose native controls such as:

- interrupt
- retry
- copy output
- expand / collapse
- reopen details

These controls belong to PRAW UI, not to terminal keybinding literacy.

## AI Provider Boundary

Codex, Qwen, and Claude become backend adapters, not UX owners.

Their responsibilities become:

- session startup
- process lifecycle
- raw stream delivery
- semantic hints where useful

They must not define:

- layout
- block structure
- visible typing model
- visible execution presentation

This creates a proper provider abstraction at the user experience boundary.

## Technical Design

### 1. Replace terminal-first projection with workspace-first projection

A dedicated projection layer must convert raw runtime signals into native workspace events.

Inputs to the projection layer:

- PTY output
- shell lifecycle markers
- provider events
- semantic detection
- user actions

Outputs from the projection layer:

- block creation
- block updates
- streaming content patches
- input-target changes
- run state changes
- terminal-block escalation

### 2. Introduce a dedicated workspace store

The old dialog/classic state model is not the right foundation for this product.

A new workspace store should own:

- timeline blocks
- active streaming assistant block
- active run registry
- active stdin target
- active embedded terminal block
- provider metadata
- expansion/collapse state
- jump-to-active state

This store becomes the visible UI truth.

### 3. Keep PTY infrastructure, narrow visible terminal usage

PTY sessions stay.

Visible xterm usage shrinks to one bounded responsibility:

- rendering `terminal-block` only when true native terminal semantics are necessary

Outside that case, terminal replay should not be the visible renderer.

### 4. Terminal escalation policy

Most AI and command flows should stay in native block rendering.

Escalate to `terminal-block` only for genuine terminal-native use cases:

- full-screen TUIs
- pager-like applications
- mouse-tracking terminal apps
- high-fidelity cursor-driven interactions

Escalation happens inside the unified timeline, not as a mode switch.

### 5. Migration path

#### Stage 1

Create the new workspace block schema and store.

#### Stage 2

Route Codex AI workflow into the new projection layer and native renderer.

#### Stage 3

Migrate Qwen and Claude onto the same renderer.

#### Stage 4

Delete classic-mode concepts and legacy mode switching.

#### Stage 5

Retain xterm only for embedded `terminal-block` use cases.

## Testing

### Behavior tests

- there is no visible classic-mode path
- bottom composer remains visible during long AI responses
- bottom composer remains visible during command execution
- composer correctly routes stdin to the active process
- focus does not drift into timeline blocks unless explicitly requested
- full-screen/TUI commands appear as embedded terminal blocks instead of mode switching

### Rendering tests

- assistant streaming updates only the active assistant block
- run output updates only the target run block
- expanding a run block does not alter composer position
- embedded terminal focus and composer focus switch cleanly

### Regression tests

- PTY process management remains correct
- interrupt behavior remains correct
- provider switching remains correct
- ordinary command execution still works without a visible classic fallback

## Recommendation

Proceed with a full Warp-native workspace rewrite.

Do not continue patching the old terminal-first presentation model.

That model cannot meet the requested quality bar because it is structurally built around visible terminal ownership, while the target product is a native command workspace with terminal execution as backend infrastructure.
