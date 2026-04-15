# Terminal Archive From Xterm Design

## Summary

PRAW will stop building command history from the live PTY text stream while a command is still running.

Instead:

- the live command console will remain a raw `xterm` surface
- running output will only be rendered by that terminal surface
- command history blocks will be archived only after the command ends
- the archived text will be derived from the terminal's final rendered screen state, not from accumulated progress frames

This is an architectural correction, not a control-sequence patch.

## Product Goal

Long-running commands with progress updates such as:

- `git clone`
- `git fetch`
- `npm install`
- `pnpm install`
- `cargo build`
- `rsync`

should feel normal in PRAW.

Success means:

- the live console can repaint freely during execution
- history does not fill with every intermediate progress percentage
- the final archived command block contains a stable, readable result
- future terminal repaint formats do not require per-tool parser patches

## Why The Current Model Fails

Today the dialog pipeline still treats the running PTY output as archive material:

1. shell output is normalized into `visibleOutput`
2. `visibleOutput` is appended into `liveConsole.transcriptCapture`
3. on `command-end`, that accumulated string becomes the command block `output`

This is structurally wrong for repainting terminal programs.

The shell integration layer is a lightweight stream cleaner. It is not a full terminal emulator. It can strip markers and some escape sequences, but it cannot reliably reconstruct the final visible screen for all repaint behaviors:

- carriage-return progress updates
- erase-line and cursor motion rewrites
- mixed stderr/stdout progress output
- vendor-specific repaint patterns
- future tools with different rendering behavior

As long as history is derived from the live text stream, progress-heavy commands will keep polluting transcript blocks.

## Approaches Considered

### 1. Keep Expanding Stream Cleanup Rules

Continue teaching `shell-integration` more control-sequence cases.

Pros:

- smallest code change
- no state model changes

Cons:

- still guesses terminal state from raw text
- every new repaint style becomes another bug
- archive quality remains fragile

Rejected because it preserves the wrong source of truth.

### 2. Archive From Xterm Final Screen State

Use the raw terminal as the runtime truth while the command runs, then archive from the terminal's final rendered content when the command exits.

Pros:

- fixes progress spam at the source
- matches what the user actually saw at command completion
- future repaint patterns are handled by terminal emulation, not by custom parsing

Cons:

- requires refactoring the live-console ownership model
- requires archive snapshots to be associated with active commands

Chosen approach.

### 3. Build A Separate Internal Terminal Emulator For History

Maintain a second screen model in app state and feed the PTY stream into both `xterm` and the archive model.

Pros:

- fully controlled archive pipeline

Cons:

- much larger project
- duplicates terminal emulation responsibility
- unnecessary while `xterm` already exists

Rejected as overbuilt for this phase.

## Chosen Architecture

### 1. Running Command Output Has One Visible Owner

While a command is active, the live command console is the only component allowed to interpret and render PTY repaint behavior.

That means:

- `XtermTerminalSurface` owns the running screen
- `DialogState.liveConsole.transcriptCapture` is removed
- `appendLiveConsoleOutput` is retired
- `terminal-view-store` no longer accumulates running command text for deferred archive

The runtime still receives raw PTY events, but those events are no longer treated as archive-ready history.

### 2. Command History Is Produced At Command End

When a command finishes:

- identify the active command block
- obtain the final archived text for that command from the terminal archive layer
- write that text into the completed command block

The archived text should reflect the stable, final visible screen for that command, not the transient repaint sequence.

If no archive snapshot is available, the system may fall back to the old plain-text path only as a defensive fallback for non-live-console cases.

### 3. Terminal Archive State Lives Alongside Terminal Runtime State

The terminal registry will gain archive responsibilities for live commands.

Per `tabId`, it should track:

- the currently rendered scrollback content needed to rehydrate remounts
- the current viewport position
- the last stable archive snapshot for the active command

Per active command block, it should be able to provide:

- a final exportable text snapshot

This keeps archive generation in the terminal subsystem instead of pushing it back into React dialog state.

### 4. Live Console And Archive Export Must Be Decoupled

The terminal subsystem will expose two distinct concepts:

- runtime replay snapshot
  - used to restore `xterm` after remount or split
- archive snapshot
  - used to finalize the command block when the command ends

They are related but not identical.

Runtime replay is about preserving the current terminal experience.

Archive export is about producing a clean completed-history block.

### 5. Archive Export Should Prefer Final Screen Text

The command archive should be generated from terminal buffer text, not from the PTY byte stream.

Export rules:

- use the terminal buffer's final visible lines
- normalize line endings to transcript-friendly text
- trim meaningless trailing blank lines conservatively
- preserve meaningful command output text exactly enough for copy and review

The archive should not attempt to preserve hidden intermediate progress frames.

## Data Flow

### Running Command

1. User submits a command.
2. `DialogState` creates a running command block with empty `output`.
3. Live PTY data is written directly into `xterm`.
4. The terminal registry updates replay state and any archive-relevant terminal snapshot state.
5. No running-output text is appended into dialog history state.

### Command Completion

1. Shell lifecycle emits `command-end`.
2. Terminal view/store resolves the active command block.
3. Terminal archive layer exports the final text snapshot for that command/tab.
4. The completed command block receives that exported text.
5. Live console state is cleared, but the archived command block remains stable in history.

## Component Changes

### `src/domain/terminal/dialog.ts`

- remove `transcriptCapture` from `LiveConsoleState`
- remove `appendLiveConsoleOutput`
- change `command-end` finalization to accept archived text from outside the dialog reducer
- keep `DialogState` responsible for block lifecycle, not live terminal transcript assembly

### `src/features/terminal/state/terminal-view-store.ts`

- stop appending running live-console output into dialog history state
- on command completion, obtain archived output from terminal archive state and pass it into command finalization
- keep current non-command session-output behavior for idle output paths

### `src/features/terminal/lib/terminal-registry.ts`

- extend the terminal registry into a terminal runtime store
- keep remount replay support
- add final-screen archive export for the active command
- support clearing command archive state when a new command starts or a tab resets

### `src/features/terminal/components/XtermTerminalSurface.tsx`

- continue owning raw runtime rendering
- update terminal archive state from the actual `xterm` buffer
- expose or trigger archive snapshot updates without leaking `xterm` internals into higher UI layers

### `src/features/terminal/components/LiveCommandConsole.tsx`

- remain visually unchanged
- become the explicit runtime-only presentation path for running commands

## Non-Goals

This design does not try to:

- preserve every intermediate progress frame in history
- replace `xterm` with a custom terminal emulator
- redesign the visual layout of the dialog workspace
- change AI transcript behavior in structured AI mode

## Error Handling

If archive export fails for a completed command:

- the command block must still complete
- the system should fall back to a safe plain-text result if available
- it must never leave the command permanently stuck in running state

If a pane remounts while a command is still running:

- replay restoration should continue to work
- the final archive should still be derived from the active terminal state after remount

## Testing Strategy

### Terminal Archive Tests

- running progress output does not create giant archived history text
- command completion archives only the final visible screen content
- remount replay and archive export do not conflict

### Dialog State Tests

- completed command blocks are populated from exported archive text
- commands without archive snapshots still complete safely
- idle session output behavior remains unchanged

### Surface Tests

- `XtermTerminalSurface` continues to replay content across remounts
- archive export tracks the final visible buffer state

## Migration Notes

The current partial `\r` cleanup work is still useful as a defensive improvement for non-terminal archive paths, but it is no longer the primary fix.

After this redesign:

- progress-heavy commands stop depending on stream cleanup correctness for history quality
- the terminal subsystem becomes the source of truth for both runtime replay and completed-command archive export

## Recommendation

Proceed with the architectural refactor now rather than spending more time on stream-level progress heuristics.

This is the smallest change that actually fixes the class of bugs shown in the user's screenshot, instead of chasing each repaint style one by one.
