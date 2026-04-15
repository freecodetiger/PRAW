# AI Mode Header Prompt Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AI quick prompt trigger into the pane header as a hard rectangular `Prompt` button placed before `AI MODE`, while keeping the expanded quick prompt input centered in the pane body as a hard rectangular input box.

**Architecture:** Split trigger placement from prompt-body rendering. `TerminalPane` owns the header trigger because it already renders pane chrome and `AI MODE`; `AiWorkflowSurface` continues to own draft, submit lifecycle, and centered prompt overlay state; `AiModePromptOverlay` becomes expanded-input-only and no longer renders the collapsed trigger. The existing prompt transport path remains unchanged.

**Tech Stack:** React, TypeScript, Vitest, CSS, existing AI prompt transport chain

---

## File Map

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx`
  Responsibility: render the header `Prompt` trigger before `AI MODE`, bridge click events down into the AI workflow surface, and gate visibility using runtime capabilities.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
  Responsibility: accept a header-trigger open request, preserve bypass prompt state ownership, and stop assuming the collapsed trigger lives inside the workflow body.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`
  Responsibility: render only the expanded centered prompt input, status, and error text; render nothing when collapsed.

- Modify: `/home/zpc/projects/praw/src/app/styles.css`
  Responsibility: style the new header trigger as a hard rectangle, keep the centered input hard-edged, and remove obsolete body-trigger styles.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx`
  Responsibility: verify header trigger placement and click-to-open wiring.

- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`
  Responsibility: verify the body no longer owns the collapsed trigger and still preserves centered-input behavior once opened.

- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts`
  Responsibility: verify rectangular header trigger styling and expanded input style contract.

## Task 1: Capture The New Header Trigger Contract In Tests

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts`

- [ ] **Step 1: Add a failing `TerminalPane` test for the header trigger location**

Add a test in `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx` that mounts an AI workflow pane and asserts:

```tsx
it("renders a quick prompt header trigger before the AI MODE badge when the runtime supports it", async () => {
  renderTerminalPane({
    presentation: "agent-workflow",
    agentBridge: {
      provider: "codex",
      mode: "raw-fallback",
      state: "fallback",
      fallbackReason: null,
      capabilities: {
        supportsResumePicker: true,
        supportsDirectResume: false,
        supportsReview: true,
        supportsModelOverride: true,
        showsBypassCapsule: true,
      },
    },
  });

  const header = screen.getByRole("button", { name: "Open quick AI prompt" }).closest(".terminal-pane__header");
  expect(header).not.toBeNull();
  expect(header?.textContent).toContain("Prompt");
  expect(header?.textContent).toContain("AI MODE");
});
```

Follow it with a second assertion or separate test that verifies panes without `showsBypassCapsule` do not render the header trigger.

- [ ] **Step 2: Add a failing `TerminalPane` test that clicking the header trigger opens the centered input**

In `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx`, add:

```tsx
it("opens the centered quick prompt input when the header trigger is clicked", async () => {
  renderTerminalPane({
    presentation: "agent-workflow",
    agentBridge: {
      provider: "codex",
      mode: "raw-fallback",
      state: "fallback",
      fallbackReason: null,
      capabilities: {
        supportsResumePicker: true,
        supportsDirectResume: false,
        supportsReview: true,
        supportsModelOverride: true,
        showsBypassCapsule: true,
      },
    },
  });

  await userEvent.click(screen.getByRole("button", { name: "Open quick AI prompt" }));

  expect(screen.getByLabelText("AI prompt input")).toBeInTheDocument();
});
```

- [ ] **Step 3: Update `AiWorkflowSurface` tests so the body no longer expects a collapsed trigger**

In `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`, replace collapsed-state assertions like:

```tsx
expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();
```

with body-local assertions:

```tsx
expect(host.querySelector('[aria-label="Open quick AI prompt"]')).toBeNull();
expect(host.querySelector('[aria-label="AI prompt input"]')).toBeNull();
```

Add a new prop-driven open test:

```tsx
it("opens the centered quick prompt input when the header request key changes", async () => {
  await act(async () => {
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
        quickPromptOpenRequestKey={1}
      />,
    );
  });

  expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
});
```

- [ ] **Step 4: Update style-contract tests for the new header trigger**

In `/home/zpc/projects/praw/src/app/styles.test.ts`, replace the old collapsed-trigger contract with:

```ts
it("styles the header quick prompt trigger as a hard rectangle", () => {
  const trigger = readRuleBlock(".terminal-pane__quick-prompt-trigger");

  expect(trigger).toContain("border-radius: 6px;");
  expect(trigger).not.toContain("border-radius: 999px;");
});
```

Keep the centered-input assertion, but adjust the wording to reflect a hard rectangular input rather than a body capsule trigger.

- [ ] **Step 5: Run targeted tests to verify they fail**

Run:

```bash
npm test -- src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
```

Expected:

- FAIL
- `TerminalPane` does not yet render the header trigger
- `AiWorkflowSurface` still owns the collapsed trigger
- styles do not yet define `.terminal-pane__quick-prompt-trigger`

- [ ] **Step 6: Commit the red test baseline**

```bash
git add src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
git commit -m "test: capture ai header prompt trigger behavior"
```

## Task 2: Move The Trigger Into `TerminalPane`

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx`

- [ ] **Step 1: Add a local request key state in `TerminalPane`**

Near the existing resume picker / expert drawer request state, add:

```tsx
  const [quickPromptRequestKey, setQuickPromptRequestKey] = useState(0);
```

This state is only for one-way “open now” requests and should not own draft data.

- [ ] **Step 2: Resolve capability visibility in `TerminalPane`**

Before render, derive a local visibility boolean from runtime capabilities:

```tsx
  const quickPromptCapabilities = getStructuredAiCommandCapabilities(
    tabState?.agentBridge?.provider ?? "codex",
    tabState?.agentBridge?.capabilities,
  );
  const showsQuickPromptTrigger = Boolean(isAgentWorkflow && quickPromptCapabilities.showsBypassCapsule);
```

Reuse existing capability helpers instead of duplicating provider logic.

- [ ] **Step 3: Render the header trigger before `AI MODE`**

Inside the header block in `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx`, insert:

```tsx
        {showsQuickPromptTrigger ? (
          <button
            className="terminal-pane__quick-prompt-trigger"
            type="button"
            aria-label="Open quick AI prompt"
            onClick={(event) => {
              event.stopPropagation();
              setQuickPromptRequestKey((value) => value + 1);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            Prompt
          </button>
        ) : null}

        {isAgentWorkflow ? (
```

This keeps drag, focus, and header semantics intact while putting the trigger in the right place.

- [ ] **Step 4: Pass the request key down into the workflow surface**

Extend the `BlockWorkspaceSurface` call:

```tsx
            quickPromptOpenRequestKey={quickPromptRequestKey}
```

- [ ] **Step 5: Run `TerminalPane` tests to verify the header trigger passes**

Run:

```bash
npm test -- src/features/terminal/components/TerminalPane.test.tsx
```

Expected:

- PASS
- trigger renders before `AI MODE`
- click opens the centered prompt input

- [ ] **Step 6: Commit the header-trigger wiring**

```bash
git add src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/TerminalPane.test.tsx
git commit -m "feat: add ai header quick prompt trigger"
```

## Task 3: Remove The Collapsed Trigger From The Workflow Body

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Add a request-key prop to `AiWorkflowSurface`**

Update the props interface in `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`:

```tsx
  quickPromptOpenRequestKey?: number;
```

and default it in the function signature:

```tsx
  quickPromptOpenRequestKey = 0,
```

- [ ] **Step 2: Open the quick prompt on request-key changes**

Add an effect in `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`:

```tsx
  useEffect(() => {
    if (quickPromptOpenRequestKey <= 0 || !showsBypassCapsule) {
      return;
    }

    setBypassPromptOpen(true);
    setBypassError(null);
  }, [quickPromptOpenRequestKey, showsBypassCapsule]);
```

- [ ] **Step 3: Remove collapsed-trigger rendering from `AiModePromptOverlay`**

Change `/home/zpc/projects/praw/src/features/terminal/components/AiModePromptOverlay.tsx` so it returns `null` while collapsed:

```tsx
  if (!expanded) {
    return null;
  }

  return (
    <div className="ai-workflow__bypass-dock-shell" aria-label="AI prompt dock" data-expanded="true">
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
    </div>
  );
```

- [ ] **Step 4: Remove body-owned open handlers that were tied to the collapsed trigger**

In `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`, update the overlay call so it no longer expects a local trigger button:

```tsx
      {showsBypassCapsule ? (
        <AiModePromptOverlay
          expanded={bypassPromptOpen}
          draft={bypassDraft}
          commandCapabilities={commandCapabilities}
          disabled={composerDisabled || isBypassSubmitting}
          error={bypassError}
          statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
          onChange={(value) => {
            setBypassDraft(value);
            setBypassError(null);
          }}
          onCollapse={closeBypassPrompt}
          onSubmit={submitBypassPrompt}
        />
      ) : null}
```

and remove the now-unused `onExpand` prop from `AiModePromptOverlay`.

- [ ] **Step 5: Run `AiWorkflowSurface` tests to verify state ownership still works**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected:

- PASS
- no collapsed body trigger remains
- request-key changes open the centered prompt
- submit and empty-draft collapse rules still work

- [ ] **Step 6: Commit the workflow-body trigger removal**

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "refactor: move ai quick prompt trigger out of workflow body"
```

## Task 4: Restyle The Trigger And Centered Input To Match Pane Chrome

**Files:**
- Modify: `/home/zpc/projects/praw/src/app/styles.css`
- Modify: `/home/zpc/projects/praw/src/app/styles.test.ts`

- [ ] **Step 1: Add the header trigger style**

In `/home/zpc/projects/praw/src/app/styles.css`, add a new rule near the header/mode-indicator styles:

```css
.terminal-pane__quick-prompt-trigger {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  background: var(--surface);
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.4;
}

.terminal-pane--agent-workflow .terminal-pane__quick-prompt-trigger {
  border-color: color-mix(in srgb, var(--ai-theme-color) 34%, var(--border));
  background: color-mix(in srgb, var(--surface) 94%, var(--ai-background-color));
}
```

- [ ] **Step 2: Remove obsolete body-trigger styles**

Delete or simplify the old collapsed-trigger CSS in `/home/zpc/projects/praw/src/app/styles.css`:

- remove `.ai-workflow__bypass-capsule`
- remove collapsed trigger assumptions from `.ai-workflow__bypass-dock-shell`

Leave only the centered expanded panel/input rules.

- [ ] **Step 3: Keep the centered input hard-edged**

Ensure `/home/zpc/projects/praw/src/app/styles.css` retains the centered-input contract:

```css
.ai-workflow__bypass-dock-shell {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
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
  min-width: 0;
  padding: 0;
  pointer-events: auto;
}

.ai-workflow__bypass-input {
  min-height: 40px;
  max-height: 160px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ai-theme-color) 24%, var(--border-muted));
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 98%, var(--ai-background-color));
  resize: none;
}
```

- [ ] **Step 4: Run style tests to verify the new header-trigger contract**

Run:

```bash
npm test -- src/app/styles.test.ts
```

Expected:

- PASS
- rectangular header trigger exists
- centered input remains hard-edged
- no duplicate outer card shell remains

- [ ] **Step 5: Commit the style update**

```bash
git add src/app/styles.css src/app/styles.test.ts
git commit -m "style: move ai quick prompt trigger to pane header"
```

## Task 5: Full Verification

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx` if full-suite regressions expose stale assumptions
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` if body/header responsibility assertions need adjustment

- [ ] **Step 1: Run focused frontend verification**

Run:

```bash
npm test -- src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.test.ts
```

Expected:

- PASS
- header trigger and centered input responsibilities both hold

- [ ] **Step 2: Run full frontend verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- `tsc --noEmit` exits `0`
- Vitest reports all test files passing

- [ ] **Step 3: Run backend regression verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

- PASS
- existing raw-fallback and capability tests remain green

- [ ] **Step 4: Run diff hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected:

- no whitespace errors
- only intended files remain modified

- [ ] **Step 5: Commit the final integrated state**

```bash
git add src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/app/styles.css src/app/styles.test.ts
git commit -m "feat: add ai header quick prompt trigger"
```

## Self-Review

- Spec coverage check:
  - header trigger before `AI MODE`: Task 1 + Task 2 + Task 4
  - centered body input remains in content area: Task 1 + Task 3 + Task 4
  - hard rectangular visual language: Task 1 + Task 4
  - no collapsed body trigger: Task 1 + Task 3
  - raw-fallback capability support remains intact: Task 1 + Task 5

- Placeholder scan:
  - no `TODO`, `TBD`, or deferred implementation placeholders remain

- Type consistency check:
  - plan consistently uses `quickPromptOpenRequestKey`, `terminal-pane__quick-prompt-trigger`, `AiModePromptOverlay`, `AiWorkflowSurface`, and `showsBypassCapsule`
