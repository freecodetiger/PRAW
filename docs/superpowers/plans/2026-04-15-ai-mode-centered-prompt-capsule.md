# AI Mode Centered Prompt Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AI-mode side dock capsule with a right-side idle trigger that opens into a centered single-piece floating input capsule, with collapse allowed only when the draft is empty.

**Architecture:** Keep state ownership inside `AiWorkflowSurface`, keep text behavior inside `StructuredAiPromptInput`, and reshape `AiModePromptOverlay` into a pure two-state presenter: collapsed right-side trigger vs centered expanded capsule. Replace the old left-expanding dock CSS instead of layering the new interaction on top of it.

**Tech Stack:** React, TypeScript, Vitest, CSS, existing AI prompt transport chain

---

## File Map

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`
  Responsibility: render the collapsed right-side `Prompt` trigger and the expanded centered input capsule, with no dedicated send button.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
  Responsibility: own bypass open/close state, guard collapse when the draft is non-empty, clear-on-success behavior, and pass the right callbacks into the overlay.

- Modify: `/home/zpc/projects/praw/src/app/styles.css`
  Responsibility: remove the old side-dock geometry and define right-side collapsed trigger plus centered floating capsule styles.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`
  Responsibility: assert the new UI contract and interaction rules.

- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts`
  Responsibility: assert the right-side collapsed trigger and centered expanded capsule style contract.

## Task 1: Lock The New Behavior In Tests

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts`

- [ ] **Step 1: Write the failing component tests for the centered capsule behavior**

Add or replace assertions in `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` so they encode the new contract:

```tsx
it("replaces the right-side trigger with a centered input capsule when expanded", async () => {
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

  host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
  expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Send quick AI prompt"]')).toBeNull();
});

it("ignores Escape while the bypass draft is non-empty and collapses only after the draft is cleared", async () => {
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

  host.querySelector('[aria-label="Open quick AI prompt"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const input = host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(input, "draft survives");
  input?.dispatchEvent(new Event("input", { bubbles: true }));
  input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
  expect((host.querySelector('[aria-label="AI prompt input"]') as HTMLTextAreaElement | null)?.value).toBe("draft survives");

  descriptor?.set?.call(input, "");
  input?.dispatchEvent(new Event("input", { bubbles: true }));
  input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  expect(host.querySelector('[aria-label="AI prompt input"]')).toBeNull();
  expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();
});
```

Also update the submit-path assertions so they verify:

- successful submit clears the bypass draft and restores the collapsed trigger
- failed submit keeps the input capsule visible and preserves the draft
- raw-fallback panes still render the quick prompt trigger when capabilities allow it

- [ ] **Step 2: Run the component tests to verify they fail for the right reason**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- FAIL
- assertions still find the old trigger while expanded, or find the old side-dock state attributes, proving the old implementation is still active

- [ ] **Step 3: Write the failing style-contract tests for right-side idle placement and centered expanded placement**

Update `/home/zpc/projects/praw/src/app/styles.test.ts` to replace the old “expands leftward” expectation with the new layout contract:

```ts
it("anchors the collapsed quick prompt trigger to the right edge", () => {
  const trigger = readRuleBlock(".ai-workflow__bypass-capsule");

  expect(trigger).toContain("position: absolute;");
  expect(trigger).toContain("right: 12px;");
  expect(trigger).not.toContain("left: 12px;");
});

it("centers the expanded quick prompt capsule within the pane", () => {
  const expanded = readRuleBlock('.ai-workflow__bypass-dock-shell[data-expanded="true"] .ai-workflow__bypass-panel');

  expect(expanded).toContain("left: 50%;");
  expect(expanded).toContain("transform: translate(-50%, -50%);");
  expect(expanded).toContain("width: min(");
});
```

Also update the presence check so it expects the new class name `.ai-workflow__bypass-panel` instead of the old `.ai-workflow__bypass-dock-panel`.

- [ ] **Step 4: Run the style tests to verify they fail**

Run:

```bash
npm test -- src/app/styles.test.ts
```

Expected:

- FAIL
- old `.ai-workflow__bypass-dock-panel` contract still exists and the new centered-panel selector is missing

- [ ] **Step 5: Commit the red test baseline**

```bash
git add src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
git commit -m "test: capture centered ai prompt capsule behavior"
```

## Task 2: Rebuild The Overlay As Trigger Vs Centered Capsule

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
- Test: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Replace the overlay markup with explicit collapsed and expanded branches**

In `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`, replace the always-mounted side-dock panel markup with a two-branch render:

```tsx
export function AiModePromptOverlay({
  expanded,
  draft,
  commandCapabilities,
  disabled = false,
  error = null,
  statusMessage = null,
  onExpand,
  onChange,
  onCollapse,
  onSubmit,
}: AiModePromptOverlayProps) {
  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded={expanded ? "true" : "false"}>
      {expanded ? (
        <div className="ai-workflow__bypass-panel">
          <StructuredAiPromptInput
            draft={draft}
            commandCapabilities={commandCapabilities}
            ariaLabel="AI prompt input"
            className="dialog-terminal__ai-prompt-input ai-workflow__bypass-input"
            rows={1}
            autoFocus={true}
            autoResize={true}
            disabled={disabled}
            placeholder=""
            onChange={onChange}
            onSubmit={onSubmit}
            onEscape={onCollapse}
          />
          {statusMessage ? <p className="dialog-terminal__ai-prompt-status">{statusMessage}</p> : null}
          {error ? <p className="dialog-terminal__ai-prompt-error">{error}</p> : null}
        </div>
      ) : (
        <button
          className="ai-workflow__bypass-capsule"
          type="button"
          aria-label="Open quick AI prompt"
          onClick={onExpand}
        >
          Prompt
        </button>
      )}
    </div>
  );
}
```

This deliberately removes the dedicated send button and the old inline dock panel.

- [ ] **Step 2: Guard collapse inside `AiWorkflowSurface` so non-empty drafts cannot dismiss the capsule**

In `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`, replace the current unconditional close helper with an empty-draft guard:

```tsx
  const closeBypassPrompt = () => {
    if (bypassDraft.trim().length > 0) {
      return;
    }

    setBypassPromptOpen(false);
    setBypassError(null);
  };
```

Keep the success path explicit so a successful submit still clears the draft before collapsing:

```tsx
    try {
      await onSubmitAiInput(normalizedInput);
      setBypassDraft("");
      setBypassPromptOpen(false);
    } catch {
      setBypassError("Could not send prompt. The draft was kept so you can retry.");
    } finally {
      setIsBypassSubmitting(false);
    }
```

This preserves the “empty-only collapse” rule without changing prompt transport.

- [ ] **Step 3: Run the component tests to verify the new behavior passes**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- PASS
- expanded overlay no longer shows the idle trigger
- `Escape` only collapses after the draft becomes empty
- submit success restores collapsed idle state
- failure preserves draft and keeps expanded state

- [ ] **Step 4: Commit the overlay behavior change**

```bash
git add src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: center ai mode quick prompt capsule"
```

## Task 3: Replace The Side-Dock Geometry With Centered Capsule Styles

**Files:**
- Modify: `/home/zpc/projects/praw/src/app/styles.css`
- Test: `/home/zpc/projects/praw/src/app/styles.test.ts`

- [ ] **Step 1: Replace the old bypass dock CSS with right-trigger and centered-panel CSS**

In `/home/zpc/projects/praw/src/app/styles.css`, replace the old `.ai-workflow__bypass-dock-panel` rules with the new geometry:

```css
.ai-workflow__bypass-dock-shell {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}

.ai-workflow__bypass-capsule,
.ai-workflow__bypass-panel {
  pointer-events: auto;
}

.ai-workflow__bypass-capsule {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  border: 1px solid color-mix(in srgb, var(--ai-theme-color) 34%, var(--border-muted));
  border-radius: 999px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--surface) 90%, var(--ai-background-color));
}

.ai-workflow__bypass-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(calc(100% - 32px), 720px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--ai-theme-color) 34%, var(--border-muted));
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 92%, var(--ai-background-color));
  box-shadow: 0 14px 32px color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(10px);
}

.ai-workflow__bypass-input {
  min-height: 40px;
  max-height: 160px;
  border-radius: 999px;
  resize: none;
}
```

Important implementation details:

- remove the width-0 / expanding-panel dock logic
- remove `row-reverse` dock layout
- keep the idle trigger explicitly right-aligned
- make the expanded capsule a single visual unit centered in the pane

- [ ] **Step 2: Adjust prompt feedback spacing so error and status text still work inside the centered capsule**

If the input plus feedback stack becomes cramped, add or refine only the local spacing rules:

```css
.ai-workflow__bypass-panel .dialog-terminal__ai-prompt-status,
.ai-workflow__bypass-panel .dialog-terminal__ai-prompt-error {
  margin: 0;
  padding-inline: 6px;
}
```

Do not reintroduce extra chrome or a footer bar.

- [ ] **Step 3: Run the style tests to verify the new contract passes**

Run:

```bash
npm test -- src/app/styles.test.ts
```

Expected:

- PASS
- right-side collapsed trigger contract is present
- centered expanded capsule contract is present

- [ ] **Step 4: Commit the style rewrite**

```bash
git add src/app/styles.css src/app/styles.test.ts
git commit -m "style: center ai prompt capsule overlay"
```

## Task 4: Run Targeted And Full Verification

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` if verification exposes broken assertions
- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts` if verification exposes stale selectors

- [ ] **Step 1: Run the focused UI verification suite**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
```

Expected:

- PASS
- centered capsule interaction and style contract are both green together

- [ ] **Step 2: Run the broader frontend suite to catch regressions**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- `tsc --noEmit` exits `0`
- Vitest reports all test files passing

- [ ] **Step 3: Run backend verification to ensure the qwen/codex raw-fallback work remains intact**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

- PASS
- existing `structured_runtime_test` and `agent_bridge_test` coverage remains green

- [ ] **Step 4: Run diff hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected:

- no whitespace errors from `git diff --check`
- only intended plan-task file changes remain unstaged or staged, depending on execution style

- [ ] **Step 5: Commit the verification-safe final state**

```bash
git add src/app/styles.css src/app/styles.test.ts src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: redesign ai mode quick prompt capsule"
```

## Self-Review

- Spec coverage check:
  - right-side collapsed trigger: Task 1 + Task 3
  - centered expanded single capsule: Task 1 + Task 2 + Task 3
  - no send button: Task 1 + Task 2
  - `Escape` only when empty: Task 1 + Task 2
  - no outside-click dismissal: Task 1 keeps this behavior asserted by omission and existing interaction coverage
  - raw-fallback compatibility: Task 1 + Task 4

- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” placeholders remain

- Type consistency check:
  - plan consistently uses `AiModePromptOverlay`, `AiWorkflowSurface`, `.ai-workflow__bypass-panel`, `bypassDraft`, and `closeBypassPrompt`
