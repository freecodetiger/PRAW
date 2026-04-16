# Terminal Screen Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw replay plus asynchronous xterm archive export with a mirror-backed terminal runtime that preserves pane state across remounts and produces stable command output exports.

**Architecture:** Introduce a per-tab `TerminalScreenMirror` inside the terminal runtime registry and make it the single authority for replay hydration, viewport restoration, and export text. `useTerminalRuntime` will feed PTY output into the mirror first, `XtermTerminalSurface` will hydrate from mirror state instead of replaying raw bytes, and `terminal-view-store` will finalize command blocks from mirror exports instead of waiting on mounted `xterm` lifecycle callbacks.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, `@xterm/xterm`, `@xterm/addon-fit`

---

## File Structure

### New Files

- `src/features/terminal/lib/terminal-screen-mirror.ts`
  - Owns the headless mirror implementation, text export helpers, viewport state, controller attachment, and tab lifecycle helpers.
- `src/features/terminal/lib/terminal-screen-mirror.test.ts`
  - Unit tests for mirror hydration, export behavior, viewport persistence, and reset/removal semantics.

### Modified Files

- `src/features/terminal/lib/terminal-registry.ts`
  - Replaced from raw replay buffer registry into mirror-backed runtime registry facade.
- `src/features/terminal/components/XtermTerminalSurface.tsx`
  - Hydrates from mirror snapshots, forwards viewport updates, stops publishing archive text from mounted xterm.
- `src/features/terminal/components/XtermTerminalSurface.test.tsx`
  - Updated to assert mirror-based hydration and viewport restoration.
- `src/features/terminal/hooks/useTerminalRuntime.ts`
  - Routes PTY output into mirror-backed runtime registry before dialog parsing.
- `src/features/terminal/state/terminal-view-store.ts`
  - Reads exported command output from mirror-backed registry on command completion.
- `src/features/terminal/state/terminal-view-store.test.ts`
  - Updated to assert command completion reads mirror export and no longer depends on `updateArchiveText`.

### Existing Files To Reference During Implementation

- `src/features/terminal/components/AiWorkflowSurface.tsx`
  - Confirms AI mode remains a raw terminal surface and should not gain a second runtime path.
- `src/features/terminal/components/AiWorkflowSurface.test.tsx`
  - Regression coverage that AI mode still renders the raw terminal surface.
- `src/features/terminal/hooks/useTerminalClipboard.ts`
  - Clipboard behavior must remain compatible with the mounted xterm controller.

---

### Task 1: Introduce The Headless Screen Mirror Module

**Files:**
- Create: `src/features/terminal/lib/terminal-screen-mirror.ts`
- Test: `src/features/terminal/lib/terminal-screen-mirror.test.ts`

- [ ] **Step 1: Write the failing mirror unit tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachMirrorController,
  createMirrorSnapshot,
  exportMirrorText,
  getMirrorSnapshot,
  removeMirror,
  resetMirror,
  updateMirrorViewport,
  writeToMirror,
} from "./terminal-screen-mirror";

describe("terminal-screen-mirror", () => {
  beforeEach(() => {
    removeMirror("tab:1");
  });

  it("stores the latest visible text for replay hydration", () => {
    writeToMirror("tab:1", "line 1\r\nline 2");

    expect(getMirrorSnapshot("tab:1")).toEqual(
      expect.objectContaining({
        replayText: "line 1\r\nline 2",
        viewportY: 0,
      }),
    );
    expect(exportMirrorText("tab:1")).toBe("line 1\nline 2");
  });

  it("preserves viewport state independently from replay text", () => {
    writeToMirror("tab:1", "history\nmore history\n");
    updateMirrorViewport("tab:1", 42);

    expect(getMirrorSnapshot("tab:1").viewportY).toBe(42);
  });

  it("replays buffered output into a controller that attaches later", () => {
    const writeDirect = vi.fn();
    writeToMirror("tab:1", "before attach");

    attachMirrorController("tab:1", {
      writeDirect,
      pasteText: vi.fn(),
      sendEnter: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelectionText: vi.fn(() => ""),
      clear: vi.fn(),
    });

    expect(writeDirect).toHaveBeenCalledWith("before attach");
  });

  it("clears replay and export state on reset", () => {
    writeToMirror("tab:1", "stale output");
    updateMirrorViewport("tab:1", 7);

    resetMirror("tab:1");

    expect(getMirrorSnapshot("tab:1")).toEqual(createMirrorSnapshot());
    expect(exportMirrorText("tab:1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new mirror test file and verify it fails**

Run: `npm test -- src/features/terminal/lib/terminal-screen-mirror.test.ts`
Expected: FAIL with module-not-found or missing export errors for `terminal-screen-mirror`.

- [ ] **Step 3: Implement the minimal mirror module**

```ts
import type { TerminalController } from "./terminal-registry";

export interface TerminalMirrorSnapshot {
  replayText: string;
  exportText: string;
  viewportY: number;
}

interface TerminalMirrorState extends TerminalMirrorSnapshot {
  controller?: TerminalController;
}

const mirrors = new Map<string, TerminalMirrorState>();

export function createMirrorSnapshot(): TerminalMirrorSnapshot {
  return {
    replayText: "",
    exportText: "",
    viewportY: 0,
  };
}

export function getMirrorSnapshot(tabId: string): TerminalMirrorSnapshot {
  const mirror = mirrors.get(tabId);
  if (!mirror) {
    return createMirrorSnapshot();
  }

  return {
    replayText: mirror.replayText,
    exportText: mirror.exportText,
    viewportY: mirror.viewportY,
  };
}

export function writeToMirror(tabId: string, data: string): void {
  if (!data) {
    return;
  }

  const mirror = ensureMirror(tabId);
  mirror.replayText += data;
  mirror.exportText = normalizeMirrorExport(mirror.replayText);
  mirror.controller?.writeDirect(data);
}

export function attachMirrorController(tabId: string, controller: TerminalController): void {
  const mirror = ensureMirror(tabId);
  mirror.controller = controller;
  if (mirror.replayText.length > 0) {
    controller.writeDirect(mirror.replayText);
  }
}

export function detachMirrorController(tabId: string): void {
  const mirror = mirrors.get(tabId);
  if (mirror) {
    delete mirror.controller;
  }
}

export function updateMirrorViewport(tabId: string, viewportY: number): void {
  ensureMirror(tabId).viewportY = Math.max(0, Math.floor(viewportY));
}

export function exportMirrorText(tabId: string): string | null {
  const mirror = mirrors.get(tabId);
  if (!mirror || mirror.exportText.length === 0) {
    return null;
  }
  return mirror.exportText;
}

export function resetMirror(tabId: string): void {
  const controller = mirrors.get(tabId)?.controller;
  mirrors.set(tabId, { ...createMirrorSnapshot(), controller });
  controller?.clear?.();
}

export function removeMirror(tabId: string): void {
  mirrors.delete(tabId);
}

function ensureMirror(tabId: string): TerminalMirrorState {
  const existing = mirrors.get(tabId);
  if (existing) {
    return existing;
  }

  const created: TerminalMirrorState = createMirrorSnapshot();
  mirrors.set(tabId, created);
  return created;
}

function normalizeMirrorExport(replayText: string): string {
  return replayText.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\n+$/g, "");
}
```

- [ ] **Step 4: Run the mirror test file and verify it passes**

Run: `npm test -- src/features/terminal/lib/terminal-screen-mirror.test.ts`
Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit the mirror module**

```bash
git add src/features/terminal/lib/terminal-screen-mirror.ts src/features/terminal/lib/terminal-screen-mirror.test.ts
git commit -m "feat: add terminal screen mirror runtime"
```

### Task 2: Refactor The Terminal Registry To Be Mirror-Backed

**Files:**
- Modify: `src/features/terminal/lib/terminal-registry.ts`
- Test: `src/features/terminal/lib/terminal-screen-mirror.test.ts`

- [ ] **Step 1: Extend the mirror tests to cover registry-facing behavior**

```ts
import {
  clearRegistry,
  exportTerminalArchive,
  getTerminal,
  getTerminalSnapshot,
  registerTerminal,
  removeDirect,
  resetDirect,
  unregisterTerminal,
  updateViewport,
  writeDirect,
} from "./terminal-registry";

it("keeps controller lookup working while reading replay and export from the mirror", () => {
  const controller = {
    writeDirect: vi.fn(),
    pasteText: vi.fn(),
    sendEnter: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelectionText: vi.fn(() => ""),
    clear: vi.fn(),
  };

  registerTerminal("tab:1", controller);
  writeDirect("tab:1", "alpha\r\nbeta");
  updateViewport("tab:1", 9);

  expect(getTerminal("tab:1")).toBe(controller);
  expect(getTerminalSnapshot("tab:1")).toEqual({
    content: "alpha\r\nbeta",
    viewportY: 9,
    archiveText: "alpha\nbeta",
  });
  expect(exportTerminalArchive("tab:1")).toBe("alpha\nbeta");

  unregisterTerminal("tab:1");
});
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `npm test -- src/features/terminal/lib/terminal-screen-mirror.test.ts`
Expected: FAIL because `terminal-registry` still stores raw snapshots directly instead of delegating to the mirror.

- [ ] **Step 3: Rewrite `terminal-registry.ts` to delegate runtime state to the mirror**

```ts
import {
  attachMirrorController,
  clearMirrors,
  detachMirrorController,
  exportMirrorText,
  getMirrorSnapshot,
  removeMirror,
  resetMirror,
  updateMirrorViewport,
  writeToMirror,
} from "./terminal-screen-mirror";

export interface TerminalController {
  writeDirect: (data: string) => void;
  pasteText: (text: string) => void;
  sendEnter: () => Promise<void> | void;
  clear?: () => void;
  focus: () => void;
  blur: () => void;
  hasSelection: () => boolean;
  getSelectionText: () => string;
}

const registry = new Map<string, TerminalController>();

export function registerTerminal(tabId: string, terminal: TerminalController): void {
  registry.set(tabId, terminal);
  attachMirrorController(tabId, terminal);
}

export function unregisterTerminal(tabId: string): void {
  registry.delete(tabId);
  detachMirrorController(tabId);
}

export function getTerminal(tabId: string): TerminalController | undefined {
  return registry.get(tabId);
}

export function getTerminalSnapshot(tabId: string): TerminalSnapshot {
  const snapshot = getMirrorSnapshot(tabId);
  return {
    content: snapshot.replayText,
    viewportY: snapshot.viewportY,
    archiveText: snapshot.exportText,
  };
}

export function exportTerminalArchive(tabId: string): string | null {
  return exportMirrorText(tabId);
}

export function writeDirect(tabId: string, data: string): void {
  writeToMirror(tabId, data);
}

export function updateViewport(tabId: string, viewportY: number): void {
  updateMirrorViewport(tabId, viewportY);
}

export function resetDirect(tabId: string): void {
  resetMirror(tabId);
}

export function removeDirect(tabId: string): void {
  registry.delete(tabId);
  removeMirror(tabId);
}

export function clearRegistry(): void {
  registry.clear();
  clearMirrors();
}
```

- [ ] **Step 4: Run the registry and mirror tests and verify they pass**

Run: `npm test -- src/features/terminal/lib/terminal-screen-mirror.test.ts src/features/terminal/components/XtermTerminalSurface.test.tsx`
Expected: mirror tests PASS, existing xterm tests may still fail on archive timing assumptions and will be fixed in the next task.

- [ ] **Step 5: Commit the registry refactor**

```bash
git add src/features/terminal/lib/terminal-registry.ts src/features/terminal/lib/terminal-screen-mirror.ts src/features/terminal/lib/terminal-screen-mirror.test.ts
git commit -m "refactor: back terminal registry with screen mirrors"
```

### Task 3: Move Xterm Hydration And Viewport Restore To Mirror Snapshots

**Files:**
- Modify: `src/features/terminal/components/XtermTerminalSurface.tsx`
- Test: `src/features/terminal/components/XtermTerminalSurface.test.tsx`

- [ ] **Step 1: Rewrite the xterm surface tests around mirror-backed hydration**

```ts
it("rehydrates from mirror replay text when the same tab remounts", async () => {
  writeDirect("tab:1", "history line 1\r\nhistory line 2");

  await act(async () => {
    root.render(
      <XtermTerminalSurface
        tabId="tab:1"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={theme}
        isActive={true}
        inputSuspended={false}
        write={write}
        resize={resize}
      />,
    );
    await Promise.resolve();
  });

  expect(terminalInstances[0]?.write).toHaveBeenCalledWith("history line 1\r\nhistory line 2");
});

it("does not depend on writeParsed archive export to restore replay content", async () => {
  writeDirect("tab:1", "mirror owned output");

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

  expect(exportTerminalArchive("tab:1")).toBe("mirror owned output");
});
```

- [ ] **Step 2: Run the xterm surface test file and verify it fails**

Run: `npm test -- src/features/terminal/components/XtermTerminalSurface.test.tsx`
Expected: FAIL because the component still calls `updateArchiveText` and still uses mounted xterm as the archive authority.

- [ ] **Step 3: Refactor `XtermTerminalSurface.tsx` to hydrate only from mirror snapshots**

```ts
import {
  getTerminalSnapshot,
  registerTerminal,
  unregisterTerminal,
  updateViewport,
} from "../lib/terminal-registry";

queueMicrotask(() => {
  const snapshot = getTerminalSnapshot(tabId);
  isReplayingRef.current = true;
  if (snapshot.content.length > 0) {
    terminal.write(snapshot.content);
  }
  fitAddon.fit();
  const targetViewport = Math.max(0, Math.min(snapshot.viewportY, terminal.buffer.active.baseY));
  if (targetViewport >= terminal.buffer.active.baseY) {
    terminal.scrollToBottom();
  } else {
    terminal.scrollToLine(targetViewport);
  }
  isReplayingRef.current = false;
  void resize(terminal.cols, terminal.rows);
});

return () => {
  observer.disconnect();
  dataDisposable.dispose();
  scrollDisposable.dispose();
  resizeDisposable.dispose();
  removeTerminalGuards();
  imeGuard?.dispose();
  textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
  unregisterTerminal(tabId);
  terminal.dispose();
};
```

- [ ] **Step 4: Run the xterm surface tests and verify they pass**

Run: `npm test -- src/features/terminal/components/XtermTerminalSurface.test.tsx`
Expected: PASS with replay hydration and viewport restoration still passing, without relying on `updateArchiveText`.

- [ ] **Step 5: Commit the xterm surface migration**

```bash
git add src/features/terminal/components/XtermTerminalSurface.tsx src/features/terminal/components/XtermTerminalSurface.test.tsx
git commit -m "refactor: hydrate xterm surfaces from screen mirrors"
```

### Task 4: Finalize Command Output From The Mirror Instead Of Mounted Xterm Timing

**Files:**
- Modify: `src/features/terminal/hooks/useTerminalRuntime.ts`
- Modify: `src/features/terminal/state/terminal-view-store.ts`
- Test: `src/features/terminal/state/terminal-view-store.test.ts`

- [ ] **Step 1: Update the terminal view store tests to remove `updateArchiveText` coupling**

```ts
it("finalizes command output from the mirror export instead of mounted xterm callbacks", () => {
  const store = useTerminalViewStore.getState();

  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.submitCommand("tab:1", "git clone https://example.com/repo.git");

  writeDirect("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");
  store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

  const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
  expect(tabState?.blocks).toEqual([
    expect.objectContaining({
      kind: "command",
      command: "git clone https://example.com/repo.git",
      output: "Receiving objects: 100%\nDone.",
    }),
  ]);
});

it("does not swallow a fast command that ends before mounted xterm callbacks would run", () => {
  const store = useTerminalViewStore.getState();

  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.submitCommand("tab:1", "ls");

  writeDirect("tab:1", "file-a\nfile-b\n");
  store.consumeOutput("tab:1", "file-a\nfile-b\n\x1b]133;D;0\x07");

  const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
  expect(tabState?.blocks).toEqual([
    expect.objectContaining({
      kind: "command",
      command: "ls",
      output: "file-a\nfile-b",
    }),
  ]);
});
```

- [ ] **Step 2: Run the store test file and verify it fails**

Run: `npm test -- src/features/terminal/state/terminal-view-store.test.ts`
Expected: FAIL because `terminal-view-store` still expects `updateArchiveText` driven exports.

- [ ] **Step 3: Update runtime output routing and command finalization**

```ts
// src/features/terminal/hooks/useTerminalRuntime.ts
void onTerminalOutput((event) => {
  const tabRef = resolveSessionTabRef(event.sessionId, sessionIndexRef.current, pendingSessionRefsRef.current);
  if (!tabRef) {
    return;
  }

  writeDirect(tabRef.tabId, event.data);

  const promptCwd = consumeOutput(tabRef.tabId, event.data);
  if (promptCwd) {
    updateTabCwd(tabRef.tabId, promptCwd);
  }
});
```

```ts
// src/features/terminal/state/terminal-view-store.ts
import { exportTerminalArchive, removeDirect, resetDirect } from "../lib/terminal-registry";

const archivedOutput =
  event.type === "command-end" && nextState.presentation !== "agent-workflow"
    ? exportTerminalArchive(tabId) ?? undefined
    : undefined;
```

```ts
// keep this logic unchanged semantically, but now it reads mirror-backed export text
nextState = {
  ...nextState,
  ...applyShellLifecycleEvent(
    nextState,
    event.type === "command-end" ? { ...event, archivedOutput } : event,
  ),
};
```

- [ ] **Step 4: Run the targeted store tests and verify they pass**

Run: `npm test -- src/features/terminal/state/terminal-view-store.test.ts`
Expected: PASS with the new fast-command regression and the final visible progress export regression both passing.

- [ ] **Step 5: Commit the mirror-backed archive finalization**

```bash
git add src/features/terminal/hooks/useTerminalRuntime.ts src/features/terminal/state/terminal-view-store.ts src/features/terminal/state/terminal-view-store.test.ts
git commit -m "fix: finalize terminal commands from screen mirror exports"
```

### Task 5: Lock In AI Mode And Remount Regressions

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Test: `src/features/terminal/components/XtermTerminalSurface.test.tsx`
- Test: `src/features/terminal/state/terminal-view-store.test.ts`

- [ ] **Step 1: Add AI-mode regression tests that assert raw mode still relies on the same runtime substrate**

```ts
it("keeps AI mode on the shared raw terminal surface after the mirror migration", () => {
  renderSurface(root, createAgentWorkflowPaneState());

  expect(host.querySelector('[data-testid="classic-terminal-surface"]')).not.toBeNull();
  expect(host.querySelector(".ai-workflow__transcript")).toBeNull();
  expect(host.querySelector('[aria-label="AI composer input"]')).toBeNull();
});
```

```ts
it("preserves mirror-backed replay state across raw AI remounts", async () => {
  writeDirect("tab:1", "prompt> codex\nreply line");

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

  expect(terminalInstances[0]?.write).toHaveBeenCalledWith("prompt> codex\nreply line");
});
```

- [ ] **Step 2: Run the AI and xterm regression tests and verify they fail where coverage is missing**

Run: `npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/XtermTerminalSurface.test.tsx`
Expected: FAIL only for the newly added regression coverage until the new expectations are implemented.

- [ ] **Step 3: Adjust any remaining test fixtures to use mirror-backed helpers only**

```ts
// remove test-only updateArchiveText calls and prefer writeDirect-driven exports
writeDirect("tab:1", "file-a\nfile-b\n");
expect(exportTerminalArchive("tab:1")).toBe("file-a\nfile-b");
```

- [ ] **Step 4: Run the full frontend verification set**

Run: `npm test`
Expected: PASS with the full Vitest suite green.

Run: `npm run typecheck`
Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the regression coverage sweep**

```bash
git add src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/XtermTerminalSurface.test.tsx src/features/terminal/state/terminal-view-store.test.ts
git commit -m "test: cover screen mirror terminal regressions"
```

## Self-Review

### Spec Coverage

- Single terminal authority per tab: covered by Task 1 and Task 2.
- Remount hydration from stable snapshots: covered by Task 3.
- Command completion from mirror export instead of mounted xterm timing: covered by Task 4.
- Split/additive behavior and preserved scrollback: covered by Task 1 snapshot state, Task 3 viewport restoration, and Task 5 regression coverage.
- AI mode sharing the same raw substrate: covered by Task 5.

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain in the task steps.
- Every code-changing step contains concrete code.
- Every verification step includes an exact command and expected result.

### Type Consistency

- Mirror API names used consistently: `writeToMirror`, `getMirrorSnapshot`, `exportMirrorText`, `attachMirrorController`, `detachMirrorController`, `updateMirrorViewport`, `resetMirror`, `removeMirror`, `clearMirrors`.
- Registry facade names remain stable for existing callers: `writeDirect`, `getTerminalSnapshot`, `exportTerminalArchive`, `resetDirect`, `removeDirect`, `clearRegistry`.
- `TerminalSnapshot` remains `{ content, viewportY, archiveText }` so existing component call sites stay focused during migration.
