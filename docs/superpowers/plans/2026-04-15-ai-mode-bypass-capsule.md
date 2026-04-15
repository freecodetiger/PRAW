# AI Mode Bypass Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the corner-mounted AI mode bypass overlay with a right-edge, vertically centered capsule that expands leftward into an inline composer and collapses only on `Escape` or successful submit.

**Architecture:** Keep all transport behavior unchanged inside `AiWorkflowSurface`; only the local bypass UI changes. Reuse the existing bypass state and submit path, but convert `AiModePromptOverlay` from an overlay shell into a docked expandable composer rendered inside the AI pane.

**Tech Stack:** React, TypeScript, Vitest, CSS

---

## File Map

- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
  Owns bypass expanded/collapsed state, draft persistence, submit success/failure handling, and structured-vs-raw visibility rules.
- Modify: `src/features/terminal/components/AiModePromptOverlay.tsx`
  Rework from detached overlay UI into a right-edge docked expandable composer presentation component.
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
  Update bypass tests from overlay semantics to inline expanding composer semantics and add outside-click persistence coverage.
- Modify: `src/app/styles.css`
  Replace lower-right floating capsule styles with right-edge centered, left-expanding composer styles.
- Modify: `src/app/styles.test.ts`
  Update style contract assertions for the new class names used by the docked composer.

## Task 1: Rework the Bypass Composer Component

**Files:**
- Modify: `src/features/terminal/components/AiModePromptOverlay.tsx`
- Test via: `src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Write the failing component-facing tests through the AI workflow surface**

Use these test updates in `src/features/terminal/components/AiWorkflowSurface.test.tsx`:

```tsx
it("expands the docked bypass composer from the right-edge capsule and submits with Enter", async () => {
  const onSubmitAiInput = vi.fn(async () => undefined);

  await act(async () => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createAgentWorkflowPaneState()}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={onSubmitAiInput}
      />,
    );
  });

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const shell = host.querySelector('[aria-label="AI prompt dock"]');
  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;

  expect(shell?.getAttribute("data-expanded")).toBe("true");
  expect(document.activeElement).toBe(input);

  await act(async () => {
    if (input) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(input, "continue from here");
    }
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(onSubmitAiInput).toHaveBeenCalledWith("continue from here");
  expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("false");
});

it("keeps the docked composer expanded on outside click and collapses on Escape while preserving draft", async () => {
  await act(async () => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createAgentWorkflowPaneState()}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={async () => undefined}
      />,
    );
  });

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;

  await act(async () => {
    if (input) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(input, "draft survives");
    }
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });

  expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("true");
  expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("draft survives");

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(host.querySelector('[aria-label="AI prompt dock"]')?.getAttribute("data-expanded")).toBe("false");

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("draft survives");
});
```

- [ ] **Step 2: Run the targeted test file to verify it fails**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- FAIL because the existing component still renders `[aria-label="AI prompt overlay"]`
- FAIL because there is no `[aria-label="AI prompt dock"]`
- FAIL because outside click behavior is not modeled as a persistent dock

- [ ] **Step 3: Replace the overlay component with a docked expandable composer**

Update `src/features/terminal/components/AiModePromptOverlay.tsx` to this shape:

```tsx
import { useEffect, useRef } from "react";

interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  onExpand: () => void;
  onChange: (value: string) => void;
  onCollapse: () => void;
  onSubmit: () => Promise<void> | void;
}

export function AiModePromptOverlay({
  expanded,
  draft,
  disabled = false,
  error = null,
  statusMessage = null,
  onExpand,
  onChange,
  onCollapse,
  onSubmit,
}: AiModePromptOverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!expanded || disabled) {
      return;
    }

    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, [disabled, expanded]);

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded={expanded ? "true" : "false"}>
      <button
        className="ai-workflow__bypass-capsule"
        type="button"
        aria-label="Open quick AI prompt"
        onClick={onExpand}
      >
        Prompt
      </button>
      <div className="ai-workflow__bypass-dock-panel">
        <textarea
          ref={inputRef}
          className="dialog-terminal__ai-prompt-input ai-workflow__bypass-input"
          aria-label="AI prompt input"
          rows={1}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          value={draft}
          disabled={disabled}
          placeholder=""
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSubmit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCollapse();
            }
          }}
        />
        {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
        {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the targeted test file to verify the component behavior now passes**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- PASS for the new docked composer assertions
- PASS for `Enter`, `Shift+Enter`, `Escape`, and draft persistence coverage

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: dock ai bypass composer"
```

## Task 2: Integrate Docked Composer Behavior Into AI Workflow Surface

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
- Test: `src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Write the failing integration assertions for structured-only visibility and collapse semantics**

Add or update these assertions in `src/features/terminal/components/AiWorkflowSurface.test.tsx`:

```tsx
it("renders the docked bypass composer only in structured AI mode", () => {
  act(() => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createAgentWorkflowPaneState()}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={async () => undefined}
      />,
    );
  });

  expect(host.querySelector('[aria-label="AI prompt dock"]')).not.toBeNull();

  act(() => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createRawFallbackPaneState()}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={async () => undefined}
      />,
    );
  });

  expect(host.querySelector('[aria-label="AI prompt dock"]')).toBeNull();
});

it("clears draft only after successful submit", async () => {
  const onSubmitAiInput = vi.fn(async () => undefined);

  await act(async () => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createAgentWorkflowPaneState()}
        status="running"
        sessionId="session-1"
        fontFamily="monospace"
        fontSize={14}
        theme={getThemePreset("dark").terminal}
        isActive={true}
        write={async () => undefined}
        resize={async () => undefined}
        onSubmitAiInput={onSubmitAiInput}
      />,
    );
  });

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;

  await act(async () => {
    if (input) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(input, "clear after success");
    }
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("");
});
```

- [ ] **Step 2: Run the targeted test file to verify it fails**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- FAIL if the dock still renders in raw fallback
- FAIL if the draft is not cleared after a successful submit/reopen cycle

- [ ] **Step 3: Update `AiWorkflowSurface` to drive the docked composer**

Modify `src/features/terminal/components/AiWorkflowSurface.tsx` so the bypass rendering looks like this:

```tsx
const hasTranscriptEntries = transcript.entries.length > 0;
const isRawFallback = bridge?.mode === "raw-fallback";
const isStructuredSurface = !isRawFallback;

const closeBypassPrompt = () => {
  setBypassPromptOpen(false);
  setBypassError(null);
};

const submitBypassPrompt = async () => {
  const normalizedInput = bypassDraft.trim();
  if (!normalizedInput || composerDisabled || isBypassSubmitting) {
    return;
  }

  setIsBypassSubmitting(true);
  setBypassError(null);

  try {
    await onSubmitAiInput(normalizedInput);
    setBypassDraft("");
    setBypassPromptOpen(false);
  } catch {
    setBypassError("Could not send prompt. The draft was kept so you can retry.");
  } finally {
    setIsBypassSubmitting(false);
  }
};

return (
  <div className="ai-workflow">
    {isStructuredSurface ? (
      <AiModePromptOverlay
        expanded={bypassPromptOpen}
        draft={bypassDraft}
        disabled={composerDisabled || isBypassSubmitting}
        error={bypassError}
        statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
        onExpand={() => {
          setBypassPromptOpen(true);
          setBypassError(null);
        }}
        onChange={(value) => {
          setBypassDraft(value);
          setBypassError(null);
        }}
        onCollapse={closeBypassPrompt}
        onSubmit={submitBypassPrompt}
      />
    ) : null}
    {/* existing structured vs raw body remains */}
  </div>
);
```

Do not add outside-click listeners.

- [ ] **Step 4: Run the targeted test file to verify the AI workflow integration passes**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- PASS for structured-only dock visibility
- PASS for successful submit clearing the draft
- PASS for disabled-session and raw-fallback expectations

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: integrate docked ai bypass composer"
```

## Task 3: Replace Corner Styles With Right-Edge Dock Styles

**Files:**
- Modify: `src/app/styles.css`
- Modify: `src/app/styles.test.ts`
- Test: `src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Write the failing style contract updates**

Update `src/app/styles.test.ts`:

```ts
it("defines styles for the docked AI bypass composer and prompt feedback", () => {
  const styles = readStyles();

  expect(styles).toContain(".ai-workflow__bypass-dock-shell");
  expect(styles).toContain(".ai-workflow__bypass-dock-shell[data-expanded=\"true\"]");
  expect(styles).toContain(".ai-workflow__bypass-dock-panel");
  expect(styles).toContain(".ai-workflow__bypass-input");
  expect(styles).toContain(".dialog-terminal__ai-prompt-error");
  expect(styles).toContain(".dialog-terminal__ai-prompt-status");
});
```

- [ ] **Step 2: Run the style test to verify it fails**

Run:

```bash
npm test -- src/app/styles.test.ts
```

Expected:

- FAIL because the new dock class names are not defined yet

- [ ] **Step 3: Implement the right-edge centered dock styles**

Replace the old lower-right capsule block in `src/app/styles.css` with:

```css
.ai-workflow__bypass-dock-shell {
  position: absolute;
  top: 50%;
  right: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  transform: translateY(-50%);
  pointer-events: none;
}

.ai-workflow__bypass-capsule,
.ai-workflow__bypass-dock-panel {
  pointer-events: auto;
}

.ai-workflow__bypass-dock-panel {
  width: 0;
  opacity: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: 1px solid transparent;
  border-right: 0;
  border-radius: 18px 0 0 18px;
  background: color-mix(in srgb, var(--surface) 92%, var(--ai-background-color));
  box-shadow: 0 14px 32px color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(10px);
  transition: width 160ms ease, opacity 120ms ease, padding 120ms ease, border-color 120ms ease;
}

.ai-workflow__bypass-dock-shell[data-expanded="true"] .ai-workflow__bypass-dock-panel {
  width: clamp(280px, 40%, 360px);
  opacity: 1;
  padding: 12px 14px;
  border-color: color-mix(in srgb, var(--ai-theme-color) 34%, var(--border-muted));
}

.ai-workflow__bypass-input {
  min-height: 40px;
  max-height: 140px;
  resize: none;
}
```

Keep the existing `.dialog-terminal__ai-prompt-error` and `.dialog-terminal__ai-prompt-status` rules.

- [ ] **Step 4: Run focused style and component tests to verify the new layout contract**

Run:

```bash
npm test -- src/app/styles.test.ts src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- PASS for the updated style contract
- PASS for the AI workflow bypass behavior tests

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run typecheck
```

Expected:

- `npm test`: PASS with all test files green
- `npm run typecheck`: PASS with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/app/styles.css src/app/styles.test.ts
git commit -m "style: dock ai bypass composer at right edge"
```

## Self-Review

- Spec coverage:
  - Right-edge vertical-center placement: Task 3
  - Leftward inline expansion: Task 3
  - `Enter` / `Shift+Enter` / `Escape`: Task 1
  - Draft persistence across collapse: Task 1
  - Success clears draft and collapses: Task 2
  - No outside-click collapse: Task 1 and Task 2
  - Structured-only visibility, raw-fallback exclusion: Task 2
  - Transport reuse unchanged: Task 2
- Placeholder scan: no `TBD`, `TODO`, or “similar to task N” placeholders remain.
- Type consistency: plan consistently uses `expanded`, `onExpand`, `onCollapse`, `draft`, and `statusMessage`.
