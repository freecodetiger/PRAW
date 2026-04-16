# AI Mode Runtime Reset And Clipboard Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate AI mode raw-terminal residue such as the stray `z` and stop IME-triggered duplicate paste/appended text by hard-resetting the runtime only on the `dialog -> agent-workflow` semantic boundary and unifying terminal clipboard handling.

**Architecture:** Keep persistent xterm runtimes for normal remounts, split panes, focus mode, resize, and viewport preservation. Add one explicit hard-reset path used only when a tab first transitions into `agent-workflow`, and put copy/paste behind a single bridge so our code no longer competes with xterm textarea `keydown` handling.

**Tech Stack:** React 19, TypeScript, Zustand, xterm.js 6, Vitest, Tauri 2

---

## Guardrails

- Do not modify split layout tree, pane focus mode, pane resize, or pane remount logic.
- Do not replace the persistent runtime model globally.
- Only hard-reset a runtime at the first `dialog -> agent-workflow` semantic transition for a tab.
- Ordinary remounts after split/focus/resize must still reuse the same xterm instance.
- Clipboard changes must reduce duplicated paths, not add another competing paste path.

## File Structure

**Modify**
- `src/features/terminal/lib/persistent-terminal-runtime.ts`: add tab-scoped runtime recreation without changing attach/detach reuse semantics.
- `src/features/terminal/lib/terminal-registry.ts`: expose `hardResetTerminalRuntime(tabId)` that clears mirror state and recreates the persistent runtime.
- `src/features/terminal/hooks/useTerminalRuntime.ts`: call hard reset only when `event.kind === "agent-workflow"` and previous presentation was not `agent-workflow`.
- `src/features/terminal/hooks/useTerminalClipboard.ts`: route copy/paste operations through the bridge and stop owning xterm textarea keydown paste behavior.
- `src/features/terminal/components/XtermTerminalSurface.tsx`: remove the extra `textarea.addEventListener("keydown", handleShortcutKeyDown, { capture: true })` clipboard path.
- `src/features/terminal/lib/clipboard.ts`: restore focus after `execCommand("copy")` fallback.

**Create**
- `src/features/terminal/lib/terminal-clipboard-bridge.ts`: small controller-facing bridge for copy and paste.
- `src/features/terminal/lib/terminal-clipboard-bridge.test.ts`: bridge behavior tests.

**Test**
- `src/features/terminal/hooks/useTerminalRuntime.test.tsx`
- `src/features/terminal/components/XtermTerminalSurface.test.tsx`
- `src/features/terminal/lib/clipboard.test.ts`
- `src/features/terminal/lib/terminal-clipboard-bridge.test.ts`

### Task 1: Add Runtime Boundary Regression Tests

**Files:**
- Modify: `src/features/terminal/hooks/useTerminalRuntime.test.tsx`
- Modify: `src/features/terminal/components/XtermTerminalSurface.test.tsx`

- [ ] **Step 1: Add a test for the AI entry boundary**

Add this test beside the existing `clears pre-AI shell output when the tab first transitions into agent workflow mode` test:

```tsx
it("hard-resets terminal state when the tab first transitions into agent workflow mode", async () => {
  useTerminalViewStore.setState((state) => ({
    ...state,
    tabStates: {
      "tab:1": {
        ...createDialogState("/bin/bash", "/workspace"),
        mode: "dialog",
        modeSource: "default",
        presentation: "default",
        shell: "/bin/bash",
        parserState: createShellIntegrationParserState(),
      },
    },
  }));

  await act(async () => {
    root.render(<RuntimeHarness />);
    await Promise.resolve();
  });

  await act(async () => {
    terminalApi.emitOutput({
      sessionId: "session-1",
      data: "zpc@zpc:~$ z",
    });
  });

  expect(getTerminalSnapshot("tab:1").content).toContain("z");

  await act(async () => {
    terminalApi.emitSemantic({
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
  });

  await act(async () => {
    terminalApi.emitOutput({
      sessionId: "session-1",
      data: "OpenAI Codex\n",
    });
  });

  expect(getTerminalSnapshot("tab:1").content).toBe("OpenAI Codex\n");
});
```

- [ ] **Step 2: Run the runtime test and verify the failure**

Run: `npm test -- src/features/terminal/hooks/useTerminalRuntime.test.tsx`

Expected: FAIL if the current implementation only calls xterm `clear()` and keeps the old active line, or PASS only if the previous fix already happens to clear the mirror text. Either way, keep this test as the semantic boundary contract.

- [ ] **Step 3: Add a split/remount preservation test**

Add or keep this behavior in `src/features/terminal/components/XtermTerminalSurface.test.tsx`:

```tsx
it("keeps reusing the same terminal instance on ordinary remounts", async () => {
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

  const firstInstance = terminalInstances[0];

  act(() => {
    root.render(<div />);
  });

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

  expect(terminalInstances).toHaveLength(1);
  expect(terminalInstances[0]).toBe(firstInstance);
});
```

- [ ] **Step 4: Run the surface test**

Run: `npm test -- src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: PASS. This confirms the split/remount path remains protected before implementation starts.

### Task 2: Implement Hard Runtime Reset Only For First AI Transition

**Files:**
- Modify: `src/features/terminal/lib/persistent-terminal-runtime.ts`
- Modify: `src/features/terminal/lib/terminal-registry.ts`
- Modify: `src/features/terminal/hooks/useTerminalRuntime.ts`
- Test: `src/features/terminal/hooks/useTerminalRuntime.test.tsx`
- Test: `src/features/terminal/components/XtermTerminalSurface.test.tsx`

- [ ] **Step 1: Add a targeted hard-reset API test**

In `src/features/terminal/components/XtermTerminalSurface.test.tsx`, import the new API after it exists:

```ts
import { hardResetTerminalRuntime } from "../lib/terminal-registry";
```

Add this test:

```tsx
it("creates a new terminal instance only when explicitly hard-reset", async () => {
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

  const firstInstance = terminalInstances[0];

  hardResetTerminalRuntime("tab:1");

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

  expect(terminalInstances).toHaveLength(2);
  expect(terminalInstances[1]).not.toBe(firstInstance);
});
```

- [ ] **Step 2: Run the test and verify it fails because the API does not exist yet**

Run: `npm test -- src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: FAIL with missing `hardResetTerminalRuntime` or equivalent.

- [ ] **Step 3: Add runtime hard reset**

In `src/features/terminal/lib/persistent-terminal-runtime.ts`, add a method to `PersistentTerminalRuntime`:

```ts
hardReset(): void {
  this.guardCleanup?.();
  this.guardCleanup = null;
  this.dataDisposable?.dispose();
  this.resizeDisposable?.dispose();
  this.scrollDisposable?.dispose();
  this.imeGuard?.dispose();
  this.dataDisposable = null;
  this.resizeDisposable = null;
  this.scrollDisposable = null;
  this.imeGuard = null;
  this.fitAddon = null;
  this.terminal?.dispose();
  this.terminal = null;
  this.pendingWrites = "";
  this.ensureTerminal();
  this.refit();
  this.syncFocus();
}
```

Export a helper:

```ts
export function hardResetPersistentTerminalRuntime(tabId: string): void {
  const runtime = runtimes.get(tabId);
  runtime?.hardReset();
}
```

- [ ] **Step 4: Add the registry-level API**

In `src/features/terminal/lib/terminal-registry.ts`, update the import:

```ts
import {
  clearPersistentTerminalRuntimes,
  disposePersistentTerminalRuntime,
  hardResetPersistentTerminalRuntime,
} from "./persistent-terminal-runtime";
```

Add this function:

```ts
export function hardResetTerminalRuntime(tabId: string): void {
  resetMirror(tabId);
  hardResetPersistentTerminalRuntime(tabId);
}
```

- [ ] **Step 5: Use the hard reset only at the AI semantic boundary**

In `src/features/terminal/hooks/useTerminalRuntime.ts`, replace the `resetDirect` import/use for this case:

```ts
import { hardResetTerminalRuntime, writeDirect } from "../lib/terminal-registry";
```

Use it only in this existing branch:

```ts
if (event.kind === "agent-workflow" && existingTabState?.presentation !== "agent-workflow") {
  hardResetTerminalRuntime(tabRef.tabId);
}
```

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/features/terminal/hooks/useTerminalRuntime.test.tsx src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: PASS. The hard reset test passes and the ordinary remount reuse test still passes.

### Task 3: Introduce The Clipboard Bridge And Remove Textarea Keydown Clipboard Ownership

**Files:**
- Create: `src/features/terminal/lib/terminal-clipboard-bridge.ts`
- Create: `src/features/terminal/lib/terminal-clipboard-bridge.test.ts`
- Modify: `src/features/terminal/hooks/useTerminalClipboard.ts`
- Modify: `src/features/terminal/components/XtermTerminalSurface.tsx`

- [ ] **Step 1: Write the failing bridge tests**

Create `src/features/terminal/lib/terminal-clipboard-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createTerminalClipboardBridge } from "./terminal-clipboard-bridge";

describe("terminal clipboard bridge", () => {
  it("copies the current terminal selection through the shared clipboard service", async () => {
    const writeText = vi.fn(async () => undefined);
    const focus = vi.fn();
    const bridge = createTerminalClipboardBridge({
      getClipboardText: async () => "",
      setClipboardText: writeText,
    });

    await bridge.copySelection({
      getSelectionText: () => "selected text",
      focus,
    });

    expect(writeText).toHaveBeenCalledWith("selected text");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("pastes exactly once through controller.pasteText", async () => {
    const pasteText = vi.fn();
    const focus = vi.fn();
    const bridge = createTerminalClipboardBridge({
      getClipboardText: async () => "payload",
      setClipboardText: async () => undefined,
    });

    await bridge.pasteClipboard({
      pasteText,
      focus,
    });

    expect(pasteText).toHaveBeenCalledTimes(1);
    expect(pasteText).toHaveBeenCalledWith("payload");
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the bridge test and verify it fails**

Run: `npm test -- src/features/terminal/lib/terminal-clipboard-bridge.test.ts`

Expected: FAIL because the bridge file does not exist.

- [ ] **Step 3: Implement the bridge**

Create `src/features/terminal/lib/terminal-clipboard-bridge.ts`:

```ts
import type { TerminalController } from "./terminal-registry";

interface ClipboardBridgeDeps {
  getClipboardText: () => Promise<string>;
  setClipboardText: (text: string) => Promise<void>;
}

export function createTerminalClipboardBridge(deps: ClipboardBridgeDeps) {
  return {
    async copySelection(controller: Pick<TerminalController, "getSelectionText" | "focus">) {
      const text = controller.getSelectionText();
      if (text) {
        await deps.setClipboardText(text);
      }
      controller.focus();
    },

    async pasteClipboard(controller: Pick<TerminalController, "pasteText" | "focus">) {
      const text = await deps.getClipboardText();
      if (text) {
        controller.pasteText(text);
      }
      controller.focus();
    },
  };
}
```

- [ ] **Step 4: Update `useTerminalClipboard` to use the bridge**

In `src/features/terminal/hooks/useTerminalClipboard.ts`, keep `copySelection` and `pasteFromClipboard`, but route both through the bridge:

```ts
const bridge = createTerminalClipboardBridge({
  getClipboardText: readClipboardText,
  setClipboardText: writeClipboardText,
});

copySelection: async () => {
  if (!terminalRef.current) {
    return;
  }

  await bridge.copySelection({
    getSelectionText: () => terminalRef.current?.getSelection() ?? "",
    focus: () => terminalRef.current?.focus(),
  });
},

pasteFromClipboard: async () => {
  if (!terminalRef.current) {
    return;
  }

  await bridge.pasteClipboard({
    pasteText: (text) => terminalRef.current?.paste(text),
    focus: () => terminalRef.current?.focus(),
  });
},
```

- [ ] **Step 5: Remove xterm textarea clipboard keydown binding**

In `src/features/terminal/components/XtermTerminalSurface.tsx`, remove this binding and cleanup:

```ts
const textarea = terminalRef.current?.textarea;
textarea?.addEventListener("keydown", handleShortcutKeyDown, { capture: true });

return () => {
  textarea?.removeEventListener("keydown", handleShortcutKeyDown, { capture: true });
  runtime.detach();
  terminalRef.current = null;
};
```

The cleanup should remain:

```ts
return () => {
  runtime.detach();
  terminalRef.current = null;
  if (forwardedTerminalRef) {
    forwardedTerminalRef.current = null;
  }
};
```

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/features/terminal/lib/terminal-clipboard-bridge.test.ts src/features/terminal/components/XtermTerminalSurface.test.tsx`

Expected: PASS.

### Task 4: Preserve Focus In Clipboard Fallback

**Files:**
- Modify: `src/features/terminal/lib/clipboard.ts`
- Modify: `src/features/terminal/lib/clipboard.test.ts`

- [ ] **Step 1: Write the failing focus test**

Add this test to `src/features/terminal/lib/clipboard.test.ts`:

```ts
it("restores the previous active element after execCommand fallback copy", async () => {
  const input = document.createElement("textarea");
  document.body.appendChild(input);
  input.focus();
  writeText.mockRejectedValueOnce(new Error("denied"));

  await writeClipboardText("pong");

  expect(document.activeElement).toBe(input);
  input.remove();
});
```

- [ ] **Step 2: Run the clipboard test and verify it fails**

Run: `npm test -- src/features/terminal/lib/clipboard.test.ts`

Expected: FAIL because fallback copy currently leaves focus on `BODY`.

- [ ] **Step 3: Implement focus restoration**

Update `copyWithExecCommand` in `src/features/terminal/lib/clipboard.ts`:

```ts
function copyWithExecCommand(text: string): void {
  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand?.("copy");
  } catch {
    // no-op: best effort fallback only
  } finally {
    textarea.remove();
    previousActiveElement?.focus();
  }
}
```

- [ ] **Step 4: Run the clipboard test again**

Run: `npm test -- src/features/terminal/lib/clipboard.test.ts`

Expected: PASS.

### Task 5: Final Verification And Diff Guard

**Files:**
- No new files beyond prior tasks.

- [ ] **Step 1: Run the targeted regression suite**

Run: `npm test -- src/features/terminal/hooks/useTerminalRuntime.test.tsx src/features/terminal/components/XtermTerminalSurface.test.tsx src/features/terminal/lib/terminal-clipboard-bridge.test.ts src/features/terminal/lib/clipboard.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: all tests pass, with the new tests included.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 4: Verify split behavior was not touched**

Run: `git diff -- src/domain/layout src/features/terminal/state/workspace-store.ts src/features/terminal/components/LayoutTree.tsx src/features/terminal/components/TerminalPane.tsx`

Expected: no diff, unless imports changed incidentally without behavior changes. If there is layout/split behavior diff, stop and review before continuing.

- [ ] **Step 5: Summarize manual verification needs**

Manual checks after implementation:
- Enter `codex` from dialog mode; the stray `z` should not appear under the welcome page.
- In AI mode with Chinese IME enabled, paste text then press `Shift+9`; only `(` should appear, with no repeated appended text.
- Split an AI mode pane; the original pane should keep its visible state and remount naturally.
- Remount/focus/resize should not create a fresh runtime unless the tab is entering AI mode for the first time.

## Self-Review

- Spec coverage: Covers the approved plan: hard reset at AI semantic boundary, single clipboard bridge, focus-preserving fallback, and split behavior protection.
- Placeholder scan: No `TODO`, `TBD`, or vague implementation placeholders remain.
- Type consistency: Uses `hardResetTerminalRuntime`, `hardResetPersistentTerminalRuntime`, and `createTerminalClipboardBridge` consistently.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-ai-mode-runtime-reset-and-clipboard-unification.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
