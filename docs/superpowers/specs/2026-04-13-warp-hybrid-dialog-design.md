# Warp-Hybrid Dialog Design

## Summary

This design reshapes dialog mode into a Warp-like hybrid terminal workflow:

- Normal right click is returned to the browser/system so copy and paste work anywhere inside a tab.
- Pane-management actions move from pane-level right click into a persistent header `...` menu.
- Dialog idle state remains a single-line command composer.
- While a command is running, the bottom area expands into a `Live Command Console`.
- Running output is rendered only inside the live console.
- When the command exits, the live console collapses immediately back to a single line and the completed command output is committed into the transcript above.
- Full-screen terminal semantics still hand off to classic mode.

The goal is not a partial “interactive input fix”. The goal is to make dialog mode behave like Warp for ordinary command execution and prompt-driven interaction while preserving the transcript-first product identity.

## Product Behavior

### 1. Context menu behavior

- Right click inside any terminal tab should open the native/system context menu for copy and paste.
- This applies to:
  - dialog transcript area
  - dialog idle composer
  - live command console
  - classic terminal surface when the browser can provide native selection behavior
- The current pane-level custom context menu must no longer be attached to the entire pane surface.
- Pane actions move into a header `...` menu and continue to expose:
  - Split Right
  - Split Down
  - Edit Note
  - Close Tab
  - Restart Shell

### 2. Dialog lifecycle

- Idle state:
  - one-line command composer at the bottom
  - transcript blocks visible above
- Running state:
  - bottom composer expands immediately into `Live Command Console`
  - the console accepts continuous PTY input
  - output is streamed only into the live console
  - transcript does not duplicate running output
- Exit state:
  - on command completion, the live console commits its full captured result into the command block transcript
  - the bottom area collapses immediately back to the single-line composer

### 3. Live Command Console behavior

- The live console is the exclusive running-time surface for:
  - stdout/stderr rendering
  - prompt reads
  - paste
  - control signals like `Ctrl+C`
  - continuing input in REPL-like or prompt-driven commands
- No local fake echo is allowed.
- Password prompts remain non-echoing if the underlying program disables echo.
- The live console should feel terminal-native, not textarea-native.

### 4. Height and layout behavior

- Height is automatic only; no manual resize handle.
- On command start, the bottom region expands to a readable default console height.
- The console may grow up to a fixed visual upper bound.
- The transcript above must retain a minimum readable area.
- If pane height is constrained, the console enters a compact terminal state instead of forcing a mode switch.
- Compact mode still supports the same PTY interaction model; it only reduces visible rows.

### 5. Classic handoff boundary

- Commands that require full-screen terminal semantics remain classic-only or runtime-escalate to classic:
  - `vim`, `nvim`, `nano`
  - `less`, `more`, `man`
  - `top`, `htop`, `btop`
  - `tmux`, `fzf`, `lazygit`
  - AI workflow presentation
- Commands that should remain in dialog live console:
  - `git push`
  - `sudo ...`
  - shell continuation flows
  - `python`, `ipython`, `node`
  - ordinary `ssh` / prompt-driven remote shell usage, unless runtime output proves classic semantics are required
- Runtime handoff still occurs when shell output enables full-screen or equivalent terminal control flows such as alternate screen or mouse-tracking modes.

## Technical Design

### 1. Pane chrome and menu ownership

- `TerminalPane` owns pane header actions and the `...` menu.
- Pane-level `onContextMenu` interception is removed from the root pane surface.
- The `...` menu becomes the only place for pane-management actions.
- Dialog and classic surfaces should no longer need to know about pane actions.

### 2. Dialog state model

Replace the current implicit “active command means PTY mode” behavior with an explicit runtime model:

- `dialogPhase: "idle" | "live-console" | "classic-handoff"`
- `liveConsole: null | { blockId: string; startedAt: number; compact: boolean; transcriptCapture: string }`
- `transcriptPolicy: "append-live" | "defer-until-exit"`

Defaults:

- idle uses no live console object
- running dialog commands use `dialogPhase = "live-console"`
- classic ownership uses `dialogPhase = "classic-handoff"`
- running commands use `transcriptPolicy = "defer-until-exit"`

The prior `composerMode` flag can be folded into `dialogPhase` or retained temporarily during migration, but the end state should avoid overlapping state flags that can drift apart.

### 3. Live console rendering model

The bottom live console should be implemented as a real terminal viewport, not a textarea with key translation.

Preferred design:

- mount a dedicated xterm-backed terminal surface for the bottom live console
- feed it from the same PTY session output stream
- use it only while dialog owns the command
- keep the transcript as a separate history representation above

This yields:

- correct cursor behavior
- correct selection semantics
- correct native-feeling paste flow
- less custom keyboard emulation

The prior textarea PTY bridge is not sufficient for Warp parity and should be considered transitional only.

### 4. Output routing

Running command output must be routed into one of two sinks:

- `dialog live console sink`
- `classic terminal sink`

Transcript is not a live sink anymore. It is an end-of-command persistence target.

Rules:

- idle shell noise still goes to transcript session blocks
- active dialog-owned command output goes only to the live console buffer
- on command exit, normalize and commit the captured output to the matching transcript block
- if the command hands off to classic, stop dialog live capture and let classic own the raw buffer directly

### 5. Buffer model

The system needs two distinct representations:

- raw terminal replay buffer
  - used for xterm surfaces and classic handoff continuity
- finalized transcript buffer
  - used for command blocks after exit

The live console should read from raw PTY data during execution.
The transcript should be derived only when the command finishes.

This separation prevents:

- duplicate rendering
- transcript corruption during screen-repaint flows
- live and transcript views fighting over the same append stream

### 6. Runtime classic escalation

- Shell integration keeps parsing shell markers as today.
- Additional runtime semantic detection decides whether dialog may continue owning the command.
- If the running stream requires classic semantics:
  - switch `dialogPhase` to `classic-handoff`
  - mount or reveal classic surface
  - reuse the same PTY session and raw buffer
  - do not restart the command
  - do not commit partial transcript until exit

## Testing

### Behavior tests

- Right click inside the dialog transcript does not open the pane menu.
- Right click inside idle composer allows system copy/paste behavior.
- Pane actions remain available from header `...`.
- Running `git push` opens the live console immediately.
- Running output appears only in the live console until exit.
- On exit, transcript block receives the full result and the console collapses immediately.
- `python` and `sudo` remain in dialog live console.
- `vim` and `less` still go classic.
- Runtime alternate-screen output hands off to classic without restarting.

### Layout tests

- Live console expands on run.
- Live console respects max height.
- Transcript preserves minimum readable space.
- Compact console mode activates under small pane height without switching to classic.

### Regression tests

- Existing AI workflow classic presentation remains unchanged.
- Existing classic font behavior remains unchanged.
- Closing confirmation logic still respects running commands.
- Copy/paste shortcuts continue to work in classic and dialog.

## Assumptions

- Warp parity is defined here as interaction parity, not pixel-for-pixel UI cloning.
- Native browser/system right-click menus are acceptable and preferred over app-owned copy/paste menus.
- Full-screen terminal semantics remain outside dialog scope and must still hand off to classic.
- The bottom live console should use xterm or equivalent terminal rendering to avoid rebuilding terminal semantics in custom React inputs.
