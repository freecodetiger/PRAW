# Terminal Archive From Xterm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop command history from archiving live PTY progress frames by making completed command blocks derive their final text from `xterm` screen state instead of live stream accumulation.

**Architecture:** Running command output remains owned by `XtermTerminalSurface` and the terminal registry. The dialog reducer stops collecting `transcriptCapture`, and command completion finalizes the block from an exported terminal archive snapshot. Runtime replay state and completed-command archive export stay in the terminal subsystem, with a fallback path only for non-live-console cases.

**Tech Stack:** React 19, TypeScript, Zustand, xterm.js, Vitest, jsdom

---

## File Map

**Modify:**

- `src/domain/terminal/dialog.ts`
- `src/domain/terminal/dialog.test.ts`
- `src/features/terminal/state/terminal-view-store.ts`
- `src/features/terminal/state/terminal-view-store.test.ts`
- `src/features/terminal/lib/terminal-registry.ts`
- `src/features/terminal/components/XtermTerminalSurface.tsx`
- `src/features/terminal/components/XtermTerminalSurface.test.tsx`
- `src/features/terminal/components/LiveCommandConsole.test.tsx`

**Keep under review while implementing:**

- `src/features/terminal/components/DialogTerminalSurface.tsx`
- `src/features/terminal/hooks/useTerminalRuntime.ts`

---

### Task 1: Introduce Terminal Archive Export In The Terminal Runtime

**Files:**

- Modify: `src/features/terminal/lib/terminal-registry.ts`
- Modify: `src/features/terminal/components/XtermTerminalSurface.tsx`
- Test: `src/features/terminal/components/XtermTerminalSurface.test.tsx`

- [ ] **Step 1: Write the failing tests for archive export**

Add tests that prove the terminal subsystem can export a final archive snapshot separately from replay content.

```tsx
it("exports the final terminal archive text for the active tab", async () => {
  writeDirect("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");

  await act(async () => {
    root.render(
      <XtermTerminalSurface
        tabId="tab:1"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={theme}
        isActive={true}
        write={write}
        resize={resize}
      />,
    );
    await Promise.resolve();
  });

  expect(exportTerminalArchive("tab:1")).toBe("Receiving objects: 100%\nDone.");
});

it("keeps replay snapshot and archive snapshot decoupled", async () => {
  writeDirect("tab:1", "line 1\nline 2\n");

  await act(async () => {
    root.render(
      <XtermTerminalSurface
        tabId="tab:1"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={theme}
        isActive={true}
        write={write}
        resize={resize}
      />,
    );
    await Promise.resolve();
  });

  act(() => {
    terminalInstances[0]!.setArchiveText("line 2");
  });

  expect(getTerminalSnapshot("tab:1").content).toBe("line 1\nline 2\n");
  expect(exportTerminalArchive("tab:1")).toBe("line 2");
});
```

- [ ] **Step 2: Run the Xterm surface test to verify it fails**

Run: `npm test -- --run src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: FAIL with missing `exportTerminalArchive` behavior or missing archive export assertions.

- [ ] **Step 3: Add terminal archive state to the registry**

Extend the terminal registry with archive export support while preserving existing replay behavior.

```ts
export interface TerminalSnapshot {
  content: string;
  viewportY: number;
  archiveText: string;
}

export function updateArchiveText(tabId: string, archiveText: string): void {
  const snapshot = ensureSnapshot(tabId);
  snapshot.archiveText = archiveText;
}

export function exportTerminalArchive(tabId: string): string | null {
  const snapshot = snapshots.get(tabId);
  if (!snapshot) {
    return null;
  }

  return snapshot.archiveText.trimEnd();
}

const EMPTY_TERMINAL_SNAPSHOT: TerminalSnapshot = {
  content: "",
  viewportY: 0,
  archiveText: "",
};
```

- [ ] **Step 4: Update `XtermTerminalSurface` to publish archive text from the xterm buffer**

Have the live terminal export a stable archive string after replay and after runtime writes change the rendered state.

```tsx
function publishArchiveSnapshot(tabId: string, terminal: Terminal) {
  const lines: string[] = [];
  const buffer = terminal.buffer.active;

  for (let index = 0; index <= buffer.baseY + terminal.rows; index += 1) {
    const line = buffer.getLine(index);
    if (!line) {
      continue;
    }

    lines.push(line.translateToString(true));
  }

  updateArchiveText(tabId, trimArchiveLines(lines).join("\n"));
}

queueMicrotask(() => {
  const snapshot = getTerminalSnapshot(tabId);
  if (snapshot.content.length > 0) {
    terminal.write(snapshot.content);
  }
  publishArchiveSnapshot(tabId, terminal);
});
```

- [ ] **Step 5: Re-run the Xterm surface test to verify it passes**

Run: `npm test -- --run src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: PASS

---

### Task 2: Remove Live Transcript Capture From The Dialog Reducer

**Files:**

- Modify: `src/domain/terminal/dialog.ts`
- Test: `src/domain/terminal/dialog.test.ts`

- [ ] **Step 1: Write the failing dialog reducer tests for external archive finalization**

Replace the old `appendLiveConsoleOutput` expectation with tests that finalize a command from archive text supplied at command end.

```ts
it("finalizes a running command from exported terminal archive text", () => {
  const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "ls", () => "cmd:1");
  const finished = applyShellLifecycleEvent(state, {
    type: "command-end",
    exitCode: 0,
    archivedOutput: "file-a\nfile-b",
  });

  expect(finished.blocks).toEqual([
    expect.objectContaining({
      id: "cmd:1",
      status: "completed",
      exitCode: 0,
      output: "file-a\nfile-b",
    }),
  ]);
});

it("falls back to existing block output when no archive text is supplied", () => {
  const state = {
    ...submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "pwd", () => "cmd:1"),
    blocks: [
      {
        id: "cmd:1",
        kind: "command" as const,
        cwd: "/workspace",
        command: "pwd",
        output: "/workspace\n",
        status: "running" as const,
        interactive: false,
        exitCode: null,
      },
    ],
  };

  const finished = applyShellLifecycleEvent(state, {
    type: "command-end",
    exitCode: 0,
  });

  expect(finished.blocks[0]?.output).toBe("/workspace\n");
});
```

- [ ] **Step 2: Run the dialog reducer test to verify it fails**

Run: `npm test -- --run src/domain/terminal/dialog.test.ts`

Expected: FAIL because `command-end` does not yet accept `archivedOutput`.

- [ ] **Step 3: Remove `transcriptCapture` and `appendLiveConsoleOutput` from dialog state**

Refactor the reducer so live-console state tracks only runtime presentation metadata.

```ts
export interface LiveConsoleState {
  blockId: string;
  compact: boolean;
}

export type ShellLifecycleEvent =
  | { type: "command-start"; entry?: string }
  | { type: "command-end"; exitCode: number; archivedOutput?: string }
  | { type: "prompt-state"; cwd: string };

// delete appendLiveConsoleOutput entirely
```

- [ ] **Step 4: Finalize command blocks from archived output**

Update `applyShellLifecycleEvent` so `command-end` prefers the external archive text.

```ts
output:
  event.type === "command-end" && typeof event.archivedOutput === "string"
    ? event.archivedOutput
    : block.output,
```

- [ ] **Step 5: Re-run the dialog reducer test to verify it passes**

Run: `npm test -- --run src/domain/terminal/dialog.test.ts`

Expected: PASS

---

### Task 3: Finalize Completed Command Blocks From Terminal Archive In The Store

**Files:**

- Modify: `src/features/terminal/state/terminal-view-store.ts`
- Test: `src/features/terminal/state/terminal-view-store.test.ts`

- [ ] **Step 1: Write the failing store tests that archive from the terminal runtime**

Add a test proving the store no longer depends on running `visibleOutput` accumulation for command history.

```ts
it("finalizes command output from terminal archive instead of live visible output", () => {
  const store = useTerminalViewStore.getState();

  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.submitCommand("tab:1", "git clone https://example.com/repo.git");
  writeDirect("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");
  updateArchiveText("tab:1", "Receiving objects: 100%\nDone.");
  store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

  const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
  expect(tabState?.blocks[0]).toEqual(
    expect.objectContaining({
      command: "git clone https://example.com/repo.git",
      output: "Receiving objects: 100%\nDone.",
    }),
  );
});
```

- [ ] **Step 2: Run the terminal view store test to verify it fails**

Run: `npm test -- --run src/features/terminal/state/terminal-view-store.test.ts`

Expected: FAIL because `consumeOutput` still uses `appendLiveConsoleOutput`.

- [ ] **Step 3: Stop accumulating running command text inside the store**

Remove the live-console accumulation branch and finalize commands from terminal archive on lifecycle completion.

```ts
const shouldCaptureVisibleOutput =
  nextState.dialogPhase !== "live-console" &&
  nextState.captureActiveOutputInTranscript &&
  nextState.presentation !== "agent-workflow";

for (const event of parsed.events) {
  const archivedOutput =
    event.type === "command-end" && nextState.presentation !== "agent-workflow"
      ? exportTerminalArchive(tabId) ?? undefined
      : undefined;

  nextState = {
    ...nextState,
    ...applyShellLifecycleEvent(
      nextState,
      event.type === "command-end" ? { ...event, archivedOutput } : event,
    ),
  };
}
```

- [ ] **Step 4: Keep idle session output behavior unchanged**

Preserve the existing `appendDialogOutput` path for:

- unsupported shells
- idle output not associated with a running command
- non-agent default presentation output

```ts
if (normalizedOutput.length > 0 && shouldCaptureVisibleOutput) {
  nextState = {
    ...nextState,
    ...appendDialogOutput(nextState, normalizedOutput),
  };
}
```

- [ ] **Step 5: Re-run the terminal view store test to verify it passes**

Run: `npm test -- --run src/features/terminal/state/terminal-view-store.test.ts`

Expected: PASS

---

### Task 4: Regression Coverage And Cleanup

**Files:**

- Modify: `src/features/terminal/components/LiveCommandConsole.test.tsx`
- Modify: `src/features/terminal/components/XtermTerminalSurface.test.tsx`
- Modify: `src/domain/terminal/dialog.test.ts`
- Modify: `src/features/terminal/state/terminal-view-store.test.ts`

- [ ] **Step 1: Add a focused regression test for progress-heavy history archiving**

Keep one high-signal regression that matches the user-reported failure mode.

```ts
it("archives only the final visible progress state for git clone style output", () => {
  const store = useTerminalViewStore.getState();

  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.submitCommand("tab:1", "git clone repo");
  updateArchiveText("tab:1", "处理 delta 中: 100% (1697/1697)，完成。");
  store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

  expect(selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1")?.blocks[0]).toEqual(
    expect.objectContaining({
      output: "处理 delta 中: 100% (1697/1697)，完成。",
    }),
  );
});
```

- [ ] **Step 2: Verify that replay restoration still works after the archive refactor**

Keep the remount and viewport restoration tests green without coupling them to archive export internals.

Run: `npm test -- --run src/features/terminal/components/XtermTerminalSurface.test.tsx src/features/terminal/components/LiveCommandConsole.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the targeted full regression suite**

Run:

```bash
npm test -- --run \
  src/domain/terminal/dialog.test.ts \
  src/features/terminal/state/terminal-view-store.test.ts \
  src/features/terminal/components/XtermTerminalSurface.test.tsx \
  src/features/terminal/components/LiveCommandConsole.test.tsx \
  src/features/terminal/components/DialogTerminalSurface.test.tsx \
  src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

---

## Self-Review

### Spec Coverage

- Replaces live transcript accumulation with xterm-derived archive export: covered by Tasks 1-3.
- Preserves runtime replay and remount behavior: covered by Tasks 1 and 4.
- Keeps idle output and non-live-console behavior stable: covered by Task 3.
- Adds regression coverage for progress-heavy commands: covered by Task 4.

### Placeholder Scan

- No `TBD`, `TODO`, or deferred implementation placeholders remain.
- Every task includes explicit files, test targets, and code-direction snippets.

### Type Consistency

- `ShellLifecycleEvent` changes are defined once in Task 2 and then consumed consistently in Task 3.
- Terminal archive APIs are introduced once in Task 1 and reused in Task 3 and Task 4 with the same names.
