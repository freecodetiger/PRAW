# AI Mode Bypass Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible AI mode floating capsule that opens an independent prompt overlay and sends `Enter` submissions through the existing real Codex prompt transport.

**Architecture:** Keep the feature local to AI mode. `AiWorkflowSurface` owns capsule/overlay state and delegates submission to its existing `onSubmitAiInput` prop, while `AiModePromptOverlay` remains a presentational focused input component. Existing `TerminalPane -> submitAiPrompt -> sendAiPrompt` transport remains the only path that decides structured bridge versus raw terminal paste.

**Tech Stack:** React 19, TypeScript, Vitest, jsdom, CSS

---

### Task 1: Add Overlay Behavior Tests

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `src/features/terminal/components/AiModePromptOverlay.tsx`
- Test: `src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Write failing tests for capsule visibility, overlay open, Enter submit, and success close**

Add these tests inside the existing `describe("AiWorkflowSurface", ...)` block in `src/features/terminal/components/AiWorkflowSurface.test.tsx`:

```tsx
it("renders an always-available bypass capsule in structured AI mode", () => {
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

  expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();
});

it("opens the bypass overlay from the capsule and submits with Enter", async () => {
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

  const capsule = host.querySelector('[aria-label="Open quick AI prompt"]');
  expect(capsule).not.toBeNull();

  await act(async () => {
    capsule?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
  expect(input).not.toBeNull();
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
  expect(host.querySelector('[aria-label="AI prompt overlay"]')).toBeNull();
});
```

- [ ] **Step 2: Write failing tests for `Shift+Enter`, `Escape`, failure preservation, and disabled session behavior**

Add these tests in the same file:

```tsx
it("keeps the bypass overlay open on Shift+Enter and closes it on Escape", async () => {
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
  expect(input).not.toBeNull();

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  });

  expect(onSubmitAiInput).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="AI prompt overlay"]')).not.toBeNull();

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(host.querySelector('[aria-label="AI prompt overlay"]')).toBeNull();
});

it("preserves the bypass draft and shows an error when submit fails", async () => {
  const onSubmitAiInput = vi.fn(async () => {
    throw new Error("bridge offline");
  });

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
      descriptor?.set?.call(input, "retry this prompt");
    }
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(host.querySelector('[aria-label="AI prompt overlay"]')).not.toBeNull();
  expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("retry this prompt");
  expect(host.textContent).toContain("Could not send prompt");
});

it("keeps the bypass capsule visible but disables submit when the session is not running", async () => {
  const onSubmitAiInput = vi.fn(async () => undefined);

  await act(async () => {
    root.render(
      <AiWorkflowSurface
        tabId="tab:1"
        paneState={createAgentWorkflowPaneState()}
        status="stopped"
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

  expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();

  await act(async () => {
    host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
  expect(input?.disabled).toBe(true);
  expect(host.textContent).toContain("The AI session is not accepting input.");
});
```

- [ ] **Step 3: Run tests to verify they fail before implementation**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: FAIL because no bypass capsule is rendered and overlay state is not wired into `AiWorkflowSurface`.

### Task 2: Wire The Bypass Capsule Into AI Workflow Surface

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `src/features/terminal/components/AiModePromptOverlay.tsx`
- Test: `src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Import the overlay component and add bypass state**

In `src/features/terminal/components/AiWorkflowSurface.tsx`, add:

```tsx
import { AiModePromptOverlay } from "./AiModePromptOverlay";
```

Add state near the existing `composerDraft` and `isInspectorOpen` state:

```tsx
const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
const [bypassDraft, setBypassDraft] = useState("");
const [bypassError, setBypassError] = useState<string | null>(null);
const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
```

- [ ] **Step 2: Add focused submit and close handlers**

Add these handlers before the `return`:

```tsx
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
```

- [ ] **Step 3: Render the always-visible capsule and overlay in both structured and raw-fallback surfaces**

Inside the top-level `<div className="ai-workflow">`, render this before the structured/raw conditional closes:

```tsx
<div className="ai-workflow__bypass-capsule-shell">
  <button
    className="ai-workflow__bypass-capsule"
    type="button"
    aria-label="Open quick AI prompt"
    onClick={() => {
      setBypassPromptOpen(true);
      setBypassError(null);
    }}
  >
    Prompt
  </button>
</div>

{bypassPromptOpen ? (
  <AiModePromptOverlay
    draft={bypassDraft}
    disabled={composerDisabled || isBypassSubmitting}
    error={bypassError}
    statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
    onChange={(value) => {
      setBypassDraft(value);
      setBypassError(null);
    }}
    onClose={closeBypassPrompt}
    onSubmit={() => void submitBypassPrompt()}
  />
) : null}
```

Keep this rendering outside the `isStructuredSurface ? ... : ...` branches so the capsule is available in structured and raw-fallback AI modes.

- [ ] **Step 4: Extend `AiModePromptOverlay` props for disabled/error/status**

In `src/features/terminal/components/AiModePromptOverlay.tsx`, update the props:

```tsx
interface AiModePromptOverlayProps {
  draft: string;
  disabled?: boolean;
  error?: string | null;
  statusMessage?: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}
```

Update the function signature:

```tsx
export function AiModePromptOverlay({
  draft,
  disabled = false,
  error = null,
  statusMessage = null,
  onChange,
  onClose,
  onSubmit,
}: AiModePromptOverlayProps) {
```

- [ ] **Step 5: Keep focus behavior but do not focus disabled textarea**

Replace the existing `useEffect` body with:

```tsx
useEffect(() => {
  if (disabled) {
    return;
  }

  inputRef.current?.focus();
  const end = inputRef.current?.value.length ?? 0;
  inputRef.current?.setSelectionRange(end, end);
}, [disabled]);
```

- [ ] **Step 6: Render disabled, status, and error UI in the overlay**

Update the textarea and footer content:

```tsx
<textarea
  ref={inputRef}
  className="dialog-terminal__ai-prompt-input"
  aria-label="AI prompt input"
  rows={1}
  spellCheck={false}
  autoCapitalize="none"
  autoCorrect="off"
  value={draft}
  disabled={disabled}
  placeholder="Send a quick prompt to the running AI session"
  onChange={(event) => onChange(event.target.value)}
  onKeyDown={(event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }}
/>
{statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
{error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
```

- [ ] **Step 7: Run tests to verify behavior**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS with the new bypass capsule tests.

- [ ] **Step 8: Commit the behavior wiring**

Run:

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: add ai mode bypass prompt capsule"
```

Expected: a commit containing only the component behavior and tests.

### Task 3: Add Low-Interference Capsule Styling

**Files:**
- Modify: `src/app/styles.css`
- Test: `src/app/styles.test.ts`

- [ ] **Step 1: Write a CSS contract test for bypass capsule styles**

Add this test to `src/app/styles.test.ts`:

```ts
it("defines styles for the AI bypass capsule and prompt feedback", () => {
  const styles = readStyles();

  expect(styles).toContain(".ai-workflow__bypass-capsule-shell");
  expect(styles).toContain(".ai-workflow__bypass-capsule");
  expect(styles).toContain(".dialog-terminal__ai-prompt-error");
  expect(styles).toContain(".dialog-terminal__ai-prompt-status");
});
```

- [ ] **Step 2: Run the style test to verify it fails before CSS implementation**

Run:

```bash
npm test -- src/app/styles.test.ts
```

Expected: FAIL because the new bypass capsule selectors do not exist yet.

- [ ] **Step 3: Add capsule and overlay feedback styles**

Add this CSS near the existing `.dialog-terminal__ai-prompt-*` styles in `src/app/styles.css`:

```css
.ai-workflow__bypass-capsule-shell {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 6;
  pointer-events: none;
}

.ai-workflow__bypass-capsule {
  pointer-events: auto;
  border: 1px solid color-mix(in srgb, var(--ai-theme-color) 34%, var(--border-muted));
  border-radius: 999px;
  padding: 7px 12px;
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  color: var(--text-muted);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(10px);
  font: inherit;
  font-size: 12px;
  opacity: 0.78;
  transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}

.ai-workflow__bypass-capsule:hover,
.ai-workflow__bypass-capsule:focus-visible {
  border-color: color-mix(in srgb, var(--ai-theme-color) 56%, var(--border));
  color: var(--text-primary);
  opacity: 1;
}

.dialog-terminal__ai-prompt-status,
.dialog-terminal__ai-prompt-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.dialog-terminal__ai-prompt-status {
  color: var(--text-muted);
}

.dialog-terminal__ai-prompt-error {
  color: var(--history-error);
}
```

- [ ] **Step 4: Run style and component tests**

Run:

```bash
npm test -- src/app/styles.test.ts src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit style support**

Run:

```bash
git add src/app/styles.css src/app/styles.test.ts
git commit -m "style: add ai bypass capsule chrome"
```

Expected: a commit containing only CSS and CSS contract test changes.

### Task 4: Verify Prompt Transport Boundary

**Files:**
- Verify: `src/features/terminal/components/TerminalPane.tsx`
- Verify: `src/features/terminal/lib/ai-prompt-transport.ts`
- Test: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Test: `src/features/terminal/lib/ai-prompt-transport.test.ts`

- [ ] **Step 1: Confirm no duplicate transport was added**

Run:

```bash
rg -n "submitTerminalAgentPrompt|pasteText|sendEnter|writeFallback|sendAiPrompt" src/features/terminal src/lib/tauri
```

Expected:

- `submitTerminalAgentPrompt` remains used from `TerminalPane.tsx`
- `pasteText`, `sendEnter`, and `writeFallback` remain contained in `ai-prompt-transport.ts` and terminal registry code
- `AiModePromptOverlay.tsx` does not import Tauri or terminal registry modules

- [ ] **Step 2: Run focused prompt transport and AI workflow tests**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/lib/ai-prompt-transport.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit verification-only plan updates if any were made**

If no files changed in this task, skip this commit. If the plan was corrected while executing, run:

```bash
git add -f docs/superpowers/plans/2026-04-15-ai-mode-bypass-capsule.md
git commit -m "docs: refine ai bypass capsule implementation plan"
```

Expected: no commit unless the plan was edited during execution.

### Task 5: Final Verification

**Files:**
- Verify: `src/features/terminal/components/AiWorkflowSurface.tsx`
- Verify: `src/features/terminal/components/AiModePromptOverlay.tsx`
- Verify: `src/app/styles.css`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/lib/ai-prompt-transport.test.ts src/app/styles.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full frontend test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Inspect final branch state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected:

- working tree is clean after commits
- recent commits include the bypass capsule implementation and style support
