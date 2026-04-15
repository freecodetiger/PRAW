# Warp-Hybrid Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite dialog mode so it behaves like Warp for ordinary command execution: native right-click copy/paste, a bottom live command console during running commands, transcript commit only after exit, and seamless classic handoff for full-screen terminal semantics.

**Architecture:** Extract a reusable xterm surface, replace the current dialog input-state hack with an explicit `idle/live-console/classic-handoff` state model, and route running command output into a live console sink instead of the transcript. Keep transcript as a finalized history view and keep classic mode as the escape hatch for full terminal semantics.

**Tech Stack:** React 19, Zustand, Vitest, TypeScript, `@xterm/xterm`, `@xterm/addon-fit`

---

## File Structure

**Create**

- `src/features/terminal/components/XtermTerminalSurface.tsx`
  - Shared xterm host used by classic mode and the new live command console.
- `src/features/terminal/components/LiveCommandConsole.tsx`
  - Bottom running-time console for dialog mode.
- `src/features/terminal/components/DialogIdleComposer.tsx`
  - One-line idle command composer, isolated from running-mode UI.
- `src/features/terminal/components/DialogTranscript.tsx`
  - Transcript-only rendering for command blocks and session output.
- `src/features/terminal/components/PaneActionMenu.tsx`
  - Header `...` menu replacing pane-level right-click actions.
- `src/features/terminal/lib/live-console-layout.ts`
  - Automatic height and compact-mode policy.
- `src/features/terminal/lib/live-console-layout.test.ts`
  - Unit tests for expansion/compact logic.
- `src/features/terminal/lib/dialog-surface-model.ts`
  - Pure mapping from tab state + pane height to `idle/live-console/classic-handoff` UI model.
- `src/features/terminal/lib/dialog-surface-model.test.ts`
  - Unit tests for the view-model transitions.
- `src/features/terminal/lib/pane-actions.ts`
  - Pure helper that lists pane actions for the header menu.
- `src/features/terminal/lib/pane-actions.test.ts`
  - Unit tests for pane action availability.

**Modify**

- `src/domain/terminal/dialog.ts`
  - Replace `composerMode`-style transitional state with explicit dialog phases and live console capture state.
- `src/domain/terminal/dialog.test.ts`
  - Cover idle/live-console/classic-handoff transitions and transcript deferral.
- `src/features/terminal/state/terminal-view-store.ts`
  - Route PTY output into live console vs transcript vs classic.
- `src/features/terminal/state/terminal-view-store.test.ts`
  - Verify deferred transcript commit, runtime classic handoff, and live console exit behavior.
- `src/features/terminal/lib/shell-integration.ts`
  - Keep shell markers and runtime classic detection compatible with live console routing.
- `src/features/terminal/lib/shell-integration.test.ts`
  - Guard against false handoff on normal shell control sequences.
- `src/features/terminal/components/DialogTerminalSurface.tsx`
  - Rewrite as orchestration component over transcript, idle composer, and live console.
- `src/features/terminal/components/ClassicTerminalSurface.tsx`
  - Convert to thin wrapper around the shared xterm host.
- `src/features/terminal/components/TerminalPane.tsx`
  - Remove pane-level right-click interception and host the new header `...` menu.
- `src/app/styles.css`
  - Add layout styles for the live console and header menu.
- `src/features/terminal/lib/close-policy.test.ts`
  - Update fixtures for the new dialog state shape.

**Delete**

- `src/features/terminal/lib/dialog-pty-input.ts`
- `src/features/terminal/lib/dialog-pty-input.test.ts`
  - Remove the temporary textarea key-translation bridge once the live console is xterm-backed.

## Task 1: Extract Shared Xterm Surface And Auto-Height Policy

**Files:**
- Create: `src/features/terminal/components/XtermTerminalSurface.tsx`
- Create: `src/features/terminal/lib/live-console-layout.ts`
- Test: `src/features/terminal/lib/live-console-layout.test.ts`
- Modify: `src/features/terminal/components/ClassicTerminalSurface.tsx`

- [ ] **Step 1: Write the failing layout test**

```ts
import { describe, expect, it } from "vitest";

import { resolveLiveConsoleLayout } from "./live-console-layout";

describe("live console layout", () => {
  it("expands to the default readable height for ordinary panes", () => {
    expect(resolveLiveConsoleLayout({ paneHeight: 720 })).toEqual({
      heightPx: 248,
      compact: false,
    });
  });

  it("enters compact mode when the pane is too short", () => {
    expect(resolveLiveConsoleLayout({ paneHeight: 340 })).toEqual({
      heightPx: 136,
      compact: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/terminal/lib/live-console-layout.test.ts`  
Expected: FAIL with module-not-found or missing `resolveLiveConsoleLayout`

- [ ] **Step 3: Write minimal layout helper**

```ts
interface LiveConsoleLayoutInput {
  paneHeight: number;
}

interface LiveConsoleLayout {
  heightPx: number;
  compact: boolean;
}

const DEFAULT_HEIGHT = 248;
const COMPACT_HEIGHT = 136;
const COMPACT_THRESHOLD = 420;

export function resolveLiveConsoleLayout({ paneHeight }: LiveConsoleLayoutInput): LiveConsoleLayout {
  if (paneHeight <= COMPACT_THRESHOLD) {
    return { heightPx: COMPACT_HEIGHT, compact: true };
  }

  return { heightPx: DEFAULT_HEIGHT, compact: false };
}
```

- [ ] **Step 4: Extract shared xterm host**

```tsx
export function XtermTerminalSurface({
  sessionId,
  bufferedOutput,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  onMount,
}: XtermTerminalSurfaceProps) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.3,
      theme,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current!);
    fitAddon.fit();
    terminal.focus();

    const dataDisposable = terminal.onData((data) => {
      void write(data);
    });

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void resize(cols, rows);
    });

    onMount?.(terminal);
  }, [fontFamily, fontSize, theme, write, resize]);

  return <div ref={containerRef} className="terminal-pane__xterm" />;
}
```

- [ ] **Step 5: Rewire classic surface to use the shared host**

```tsx
export function ClassicTerminalSurface(props: ClassicTerminalSurfaceProps) {
  return (
    <XtermTerminalSurface
      sessionId={props.sessionId}
      bufferedOutput={props.bufferedOutput}
      fontFamily={props.fontFamily}
      fontSize={props.fontSize}
      theme={props.theme}
      isActive={props.isActive}
      write={props.write}
      resize={props.resize}
      onMount={installClassicTerminalProtocolGuards}
    />
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/features/terminal/lib/live-console-layout.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/terminal/components/XtermTerminalSurface.tsx \
  src/features/terminal/components/ClassicTerminalSurface.tsx \
  src/features/terminal/lib/live-console-layout.ts \
  src/features/terminal/lib/live-console-layout.test.ts
git commit -m "refactor: extract shared xterm surface"
```

## Task 2: Replace Transitional Dialog State With Explicit Runtime Phases

**Files:**
- Modify: `src/domain/terminal/dialog.ts`
- Test: `src/domain/terminal/dialog.test.ts`

- [ ] **Step 1: Write the failing phase-model tests**

```ts
it("starts ordinary commands in live-console phase and defers transcript capture", () => {
  const next = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "git push", () => "cmd:push");

  expect(next.dialogPhase).toBe("live-console");
  expect(next.liveConsole).toEqual(
    expect.objectContaining({
      blockId: "cmd:push",
      compact: false,
      transcriptCapture: "",
    }),
  );
  expect(next.transcriptPolicy).toBe("defer-until-exit");
});

it("starts vim in classic-handoff phase", () => {
  const next = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "vim notes.txt", () => "cmd:vim");

  expect(next.dialogPhase).toBe("classic-handoff");
  expect(next.mode).toBe("classic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/terminal/dialog.test.ts`  
Expected: FAIL with missing `dialogPhase`, `liveConsole`, or `transcriptPolicy`

- [ ] **Step 3: Add explicit dialog runtime types**

```ts
export type DialogPhase = "idle" | "live-console" | "classic-handoff";
export type TranscriptPolicy = "append-live" | "defer-until-exit";

export interface LiveConsoleState {
  blockId: string;
  compact: boolean;
  transcriptCapture: string;
}

export interface DialogState {
  preferredMode: PaneRenderMode;
  mode: PaneRenderMode;
  modeSource: PaneRenderModeSource;
  presentation: TerminalPresentation;
  dialogPhase: DialogPhase;
  liveConsole: LiveConsoleState | null;
  transcriptPolicy: TranscriptPolicy;
  shellIntegration: ShellIntegrationStatus;
  cwd: string;
  blocks: CommandBlock[];
  activeCommandBlockId: string | null;
  composerHistory: string[];
}
```

- [ ] **Step 4: Update state transitions**

```ts
export function submitDialogCommand(state: DialogState, command: string, createId: () => string): DialogState {
  const commandKind = classifyCommand(command.trim());
  const blockId = createId();
  const startsInClassic = commandKind === "classic-required" || commandKind === "agent-workflow";

  return {
    ...state,
    mode: startsInClassic ? "classic" : state.mode,
    modeSource: startsInClassic ? "auto-interactive" : state.modeSource,
    dialogPhase: startsInClassic ? "classic-handoff" : "live-console",
    liveConsole: {
      blockId,
      compact: false,
      transcriptCapture: "",
    },
    transcriptPolicy: "defer-until-exit",
    activeCommandBlockId: blockId,
    composerHistory: [...state.composerHistory, command.trim()],
    blocks: [
      ...state.blocks,
      {
        id: blockId,
        kind: "command",
        cwd: state.cwd,
        command: command.trim(),
        output: "",
        status: "running",
        interactive: commandKind !== "dialog-stream",
        exitCode: null,
      },
    ],
  };
}
```

- [ ] **Step 5: Reset phase on command exit**

```ts
function restoreIdleDialogState(state: DialogState): DialogState {
  return {
    ...state,
    dialogPhase: "idle",
    liveConsole: null,
    transcriptPolicy: "append-live",
    activeCommandBlockId: null,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/domain/terminal/dialog.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/terminal/dialog.ts src/domain/terminal/dialog.test.ts
git commit -m "refactor: model dialog runtime phases explicitly"
```

## Task 3: Route Running Output Into Live Console And Defer Transcript Commit

**Files:**
- Modify: `src/features/terminal/state/terminal-view-store.ts`
- Test: `src/features/terminal/state/terminal-view-store.test.ts`
- Modify: `src/features/terminal/lib/shell-integration.ts`
- Test: `src/features/terminal/lib/shell-integration.test.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
it("keeps running output out of transcript until command exit", () => {
  useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  useTerminalViewStore.getState().submitCommand("tab:1", "git push");
  useTerminalViewStore.getState().consumeOutput("tab:1", "Enumerating objects...\n");

  const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
  expect(tabState.liveConsole?.transcriptCapture).toBe("Enumerating objects...\n");
  expect(tabState.blocks[0]?.output).toBe("");
});

it("commits captured live console output into the transcript when the command exits", () => {
  useTerminalViewStore.getState().syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  useTerminalViewStore.getState().submitCommand("tab:1", "git push");
  useTerminalViewStore.getState().consumeOutput("tab:1", "Enumerating objects...\n");
  useTerminalViewStore.getState().consumeOutput("tab:1", "\u001b]133;D;0\u0007");

  const tabState = useTerminalViewStore.getState().tabStates[getTerminalBufferKey("tab:1")];
  expect(tabState.blocks[0]?.output).toBe("Enumerating objects...\n");
  expect(tabState.dialogPhase).toBe("idle");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/terminal/state/terminal-view-store.test.ts src/features/terminal/lib/shell-integration.test.ts`  
Expected: FAIL because running output still lands in `block.output`

- [ ] **Step 3: Add live-console capture helpers to dialog state**

```ts
export function appendLiveConsoleOutput(state: DialogState, data: string): DialogState {
  if (!state.liveConsole || data.length === 0) {
    return state;
  }

  return {
    ...state,
    liveConsole: {
      ...state.liveConsole,
      transcriptCapture: `${state.liveConsole.transcriptCapture}${data}`,
    },
  };
}

export function finalizeLiveConsoleTranscript(state: DialogState): DialogState {
  if (!state.liveConsole) {
    return state;
  }

  return {
    ...state,
    blocks: state.blocks.map((block) =>
      block.id === state.liveConsole?.blockId ? { ...block, output: state.liveConsole?.transcriptCapture ?? "" } : block,
    ),
  };
}
```

- [ ] **Step 4: Change store routing so running dialog commands feed live console only**

```ts
const shouldRouteToLiveConsole =
  nextState.dialogPhase === "live-console" &&
  nextState.activeCommandBlockId !== null &&
  normalizedOutput.length > 0 &&
  !parsed.requiresClassic &&
  !entersAgentWorkflow;

if (shouldRouteToLiveConsole) {
  nextState = {
    ...nextState,
    ...appendLiveConsoleOutput(nextState, normalizedOutput),
  };
}

if (parsed.events.some((event) => event.type === "command-end")) {
  nextState = {
    ...nextState,
    ...finalizeLiveConsoleTranscript(nextState),
  };
}
```

- [ ] **Step 5: Keep runtime classic detection narrow**

```ts
function requiresClassicSequence(sequence: string): boolean {
  if (!sequence.startsWith(`${ESC}[`)) {
    return false;
  }

  return /^\u001b\[\?(?:1|9|1000|1002|1003|1004|1005|1006|1015|1016|1047|1048|1049)[hl]$/u.test(sequence);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/features/terminal/state/terminal-view-store.test.ts src/features/terminal/lib/shell-integration.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/terminal/state/terminal-view-store.ts \
  src/features/terminal/state/terminal-view-store.test.ts \
  src/features/terminal/lib/shell-integration.ts \
  src/features/terminal/lib/shell-integration.test.ts \
  src/domain/terminal/dialog.ts
git commit -m "feat: route dialog output through live console"
```

## Task 4: Rewrite Dialog Surface Around Transcript + Idle Composer + Live Console

**Files:**
- Create: `src/features/terminal/components/DialogTranscript.tsx`
- Create: `src/features/terminal/components/DialogIdleComposer.tsx`
- Create: `src/features/terminal/components/LiveCommandConsole.tsx`
- Create: `src/features/terminal/lib/dialog-surface-model.ts`
- Test: `src/features/terminal/lib/dialog-surface-model.test.ts`
- Modify: `src/features/terminal/components/DialogTerminalSurface.tsx`
- Modify: `src/app/styles.css`
- Delete: `src/features/terminal/lib/dialog-pty-input.ts`
- Delete: `src/features/terminal/lib/dialog-pty-input.test.ts`

- [ ] **Step 1: Write the failing dialog surface-model test**

```ts
import { describe, expect, it } from "vitest";

import { resolveDialogSurfaceModel } from "./dialog-surface-model";

describe("dialog surface model", () => {
  it("shows the live console during a running dialog-owned command", () => {
    expect(
      resolveDialogSurfaceModel({
        mode: "dialog",
        dialogPhase: "live-console",
        paneHeight: 720,
      }),
    ).toEqual({
      showTranscript: true,
      showIdleComposer: false,
      showLiveConsole: true,
      compact: false,
    });
  });

  it("restores the idle composer after command exit", () => {
    expect(
      resolveDialogSurfaceModel({
        mode: "dialog",
        dialogPhase: "idle",
        paneHeight: 720,
      }),
    ).toEqual({
      showTranscript: true,
      showIdleComposer: true,
      showLiveConsole: false,
      compact: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/terminal/lib/dialog-surface-model.test.ts`  
Expected: FAIL with missing `resolveDialogSurfaceModel`

- [ ] **Step 3: Implement the surface model helper**

```ts
export function resolveDialogSurfaceModel({
  mode,
  dialogPhase,
  paneHeight,
}: ResolveDialogSurfaceModelInput): DialogSurfaceModel {
  const layout = resolveLiveConsoleLayout({ paneHeight });

  return {
    showTranscript: mode === "dialog",
    showIdleComposer: mode === "dialog" && dialogPhase === "idle",
    showLiveConsole: mode === "dialog" && dialogPhase === "live-console",
    compact: dialogPhase === "live-console" ? layout.compact : false,
    liveConsoleHeightPx: dialogPhase === "live-console" ? layout.heightPx : 0,
  };
}
```

- [ ] **Step 4: Create transcript, idle composer, and live console components**

```tsx
export function LiveCommandConsole({ sessionId, bufferedOutput, fontFamily, fontSize, theme, isActive, write, resize, heightPx }: LiveCommandConsoleProps) {
  return (
    <div className="live-command-console" style={{ height: `${heightPx}px` }}>
      <div className="live-command-console__label">Live Command Console</div>
      <XtermTerminalSurface
        sessionId={sessionId}
        bufferedOutput={bufferedOutput}
        fontFamily={fontFamily}
        fontSize={fontSize}
        theme={theme}
        isActive={isActive}
        write={write}
        resize={resize}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `DialogTerminalSurface` as an orchestrator**

```tsx
export function DialogTerminalSurface(props: DialogTerminalSurfaceProps) {
  const surfaceModel = resolveDialogSurfaceModel({
    mode: props.paneState.mode,
    dialogPhase: props.paneState.dialogPhase,
    paneHeight: props.paneHeight,
  });

  return (
    <div className="dialog-terminal">
      <DialogTranscript blocks={props.paneState.blocks} />
      {surfaceModel.showLiveConsole ? (
        <LiveCommandConsole
          sessionId={props.sessionId}
          bufferedOutput={props.bufferedOutput}
          fontFamily={props.fontFamily}
          fontSize={props.fontSize}
          theme={props.theme}
          isActive={props.isActive}
          write={props.onWriteInput}
          resize={props.onResize}
          heightPx={surfaceModel.liveConsoleHeightPx}
        />
      ) : null}
      {surfaceModel.showIdleComposer ? <DialogIdleComposer onSubmitCommand={props.onSubmitCommand} paneState={props.paneState} status={props.status} /> : null}
    </div>
  );
}
```

- [ ] **Step 6: Remove the transitional textarea PTY bridge**

```bash
git rm src/features/terminal/lib/dialog-pty-input.ts
git rm src/features/terminal/lib/dialog-pty-input.test.ts
```

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/features/terminal/lib/dialog-surface-model.test.ts src/domain/terminal/dialog.test.ts src/features/terminal/state/terminal-view-store.test.ts`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/terminal/components/DialogTranscript.tsx \
  src/features/terminal/components/DialogIdleComposer.tsx \
  src/features/terminal/components/LiveCommandConsole.tsx \
  src/features/terminal/components/DialogTerminalSurface.tsx \
  src/features/terminal/components/XtermTerminalSurface.tsx \
  src/features/terminal/lib/dialog-surface-model.ts \
  src/features/terminal/lib/dialog-surface-model.test.ts \
  src/app/styles.css
git commit -m "feat: rewrite dialog surface around live console"
```

## Task 5: Move Pane Actions Into Header Menu And Restore Native Right Click

**Files:**
- Create: `src/features/terminal/components/PaneActionMenu.tsx`
- Create: `src/features/terminal/lib/pane-actions.ts`
- Test: `src/features/terminal/lib/pane-actions.test.ts`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing pane-action helper test**

```ts
import { describe, expect, it } from "vitest";

import { buildPaneActions } from "./pane-actions";

describe("pane actions", () => {
  it("returns split and restart actions when the pane can still be managed", () => {
    expect(
      buildPaneActions({
        canSplitHorizontal: true,
        canSplitVertical: true,
        canClose: true,
      }).map((item) => item.id),
    ).toEqual(["split-right", "split-down", "edit-note", "close-tab", "restart-shell"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/terminal/lib/pane-actions.test.ts`  
Expected: FAIL with missing `buildPaneActions`

- [ ] **Step 3: Implement the helper and menu component**

```ts
export function buildPaneActions({ canSplitHorizontal, canSplitVertical, canClose }: BuildPaneActionsInput): PaneActionItem[] {
  return [
    { id: "split-right", label: "Split Right", disabled: !canSplitHorizontal },
    { id: "split-down", label: "Split Down", disabled: !canSplitVertical },
    { id: "edit-note", label: "Edit Note", disabled: false },
    { id: "close-tab", label: "Close Tab", disabled: !canClose },
    { id: "restart-shell", label: "Restart Shell", disabled: false },
  ];
}
```

```tsx
export function PaneActionMenu({ items, onSelect }: PaneActionMenuProps) {
  return (
    <div className="pane-action-menu">
      <button className="pane-action-menu__trigger" type="button" aria-label="Pane actions">
        ...
      </button>
      <div className="pane-action-menu__popover">
        {items.map((item) => (
          <button key={item.id} className="pane-action-menu__item" type="button" disabled={item.disabled} onClick={() => onSelect(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Remove pane-level custom right-click interception**

```tsx
<section
  ref={paneRef}
  className={paneClassName}
  style={paneStyle}
  onMouseDown={() => {
    setActiveTab(tabId);
  }}
>
```

- [ ] **Step 5: Mount the new header menu**

```tsx
<PaneActionMenu
  items={buildPaneActions({ canSplitHorizontal, canSplitVertical, canClose })}
  onSelect={(actionId) => {
    switch (actionId) {
      case "split-right":
        runSplitAction("horizontal");
        break;
      case "split-down":
        runSplitAction("vertical");
        break;
      case "edit-note":
        startEditingNote();
        break;
      case "close-tab":
        void requestClose();
        break;
      case "restart-shell":
        void restart();
        break;
    }
  }}
/>
```

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/features/terminal/lib/pane-actions.test.ts src/features/terminal/lib/close-policy.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/terminal/components/PaneActionMenu.tsx \
  src/features/terminal/lib/pane-actions.ts \
  src/features/terminal/lib/pane-actions.test.ts \
  src/features/terminal/components/TerminalPane.tsx \
  src/app/styles.css
git commit -m "feat: move pane actions into header menu"
```

## Task 6: Final Verification And Warp-Parity Manual Checks

**Files:**
- Modify: `src/features/terminal/lib/close-policy.test.ts`
- Modify: any touched files from earlier tasks

- [ ] **Step 1: Update close-policy fixtures for the final dialog state**

```ts
function createDialogState(overrides: Partial<DialogState> = {}): DialogState {
  return {
    preferredMode: "dialog",
    mode: "dialog",
    modeSource: "default",
    presentation: "default",
    dialogPhase: "idle",
    liveConsole: null,
    transcriptPolicy: "append-live",
    shellIntegration: "supported",
    cwd: "~",
    blocks: [],
    activeCommandBlockId: null,
    composerHistory: [],
    ...overrides,
  };
}
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`  
Expected: PASS with 0 failures

- [ ] **Step 3: Run type checking**

Run: `npm run typecheck`  
Expected: PASS with no TypeScript errors

- [ ] **Step 4: Run production build**

Run: `npm run build`  
Expected: PASS and Vite build output

- [ ] **Step 5: Perform manual Warp-parity checks**

Manual scenarios:

```text
1. Right click transcript text -> native copy/paste menu appears
2. Right click idle composer -> native copy/paste menu appears
3. Click header ... -> pane actions menu appears
4. Run `git push` -> live console opens immediately, output only appears there
5. Finish `git push` -> console collapses immediately, transcript block receives full result
6. Run `python` -> live console stays interactive
7. Run `sudo ls` -> password prompt stays inside live console
8. Run `vim` -> pane hands off to classic
9. Run a narrow-height pane -> live console enters compact mode instead of switching to classic
```

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/lib/close-policy.test.ts \
  src/domain/terminal/dialog.ts \
  src/domain/terminal/dialog.test.ts \
  src/features/terminal/state/terminal-view-store.ts \
  src/features/terminal/state/terminal-view-store.test.ts \
  src/features/terminal/lib/shell-integration.ts \
  src/features/terminal/lib/shell-integration.test.ts \
  src/features/terminal/components/*.tsx \
  src/features/terminal/lib/*.ts \
  src/app/styles.css
git commit -m "feat: deliver warp-hybrid dialog terminal"
```
