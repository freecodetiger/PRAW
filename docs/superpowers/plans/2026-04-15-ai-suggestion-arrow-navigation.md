# AI Suggestion Arrow Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plain `ArrowUp` and `ArrowDown` navigate AI suggestions only when the suggestion bar is explicitly open, while preserving composer history behavior when the bar is closed.

**Architecture:** Keep the change local to the idle composer. The implementation only adjusts keyboard-routing priority in `DialogIdleComposer` and adds focused regression coverage in the existing component test file. No suggestion-engine or backend changes are required.

**Tech Stack:** React 19, TypeScript, Vitest, jsdom

---

### Task 1: Restore Design Context In This Branch

**Files:**
- Create: `docs/superpowers/specs/2026-04-15-ai-suggestion-arrow-navigation-design.md`
- Create: `docs/superpowers/plans/2026-04-15-ai-suggestion-arrow-navigation.md`

- [ ] **Step 1: Add the approved design document to this worktree**

```md
# AI Suggestion Arrow Navigation Design

Date: 2026-04-15

## Goal

- When the suggestion bar is explicitly open, plain ArrowUp and ArrowDown navigate visible suggestions.
- When the suggestion bar is closed, plain ArrowUp and ArrowDown keep terminal history semantics.
```

- [ ] **Step 2: Add the implementation plan document**

```md
# AI Suggestion Arrow Navigation Implementation Plan

**Goal:** Make plain ArrowUp and ArrowDown navigate AI suggestions only when the suggestion bar is explicitly open.
```

- [ ] **Step 3: Commit the docs context**

Run:

```bash
git add docs/superpowers/specs/2026-04-15-ai-suggestion-arrow-navigation-design.md docs/superpowers/plans/2026-04-15-ai-suggestion-arrow-navigation.md
git commit -m "docs: capture ai suggestion arrow navigation plan"
```

Expected: a commit containing the spec and implementation plan only.

### Task 2: Add Failing Tests For Plain Arrow Navigation

**Files:**
- Modify: `src/features/terminal/components/DialogIdleComposer.test.tsx`
- Test: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [ ] **Step 1: Write a failing test for moving down the explicit suggestion list with plain ArrowDown**

```tsx
it("navigates the explicit suggestion bar with plain ArrowDown", async () => {
  requestLocalCompletion.mockResolvedValue({
    suggestions: [
      { text: "git status", source: "local", score: 950, kind: "git" },
      { text: "git stash", source: "local", score: 940, kind: "git" },
    ],
    context: {
      pwd: "/workspace",
      gitBranch: "main",
      gitStatusSummary: [],
      recentHistory: ["git status"],
      cwdSummary: { dirs: ["src"], files: ["package.json"] },
      systemSummary: { os: "ubuntu", shell: "/bin/bash", packageManager: "apt" },
      toolAvailability: ["git"],
    },
  });

  const paneState = createIdlePaneState();

  act(() => {
    root.render(
      <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
    );
  });

  const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
  expect(input).not.toBeNull();

  act(() => {
    input?.focus();
    input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    if (input) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(input, "git st");
    }
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await flush();
  await flush();

  act(() => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  });

  await flush();

  act(() => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });

  await flush();

  const selectedOptions = host.querySelectorAll('[role="option"][aria-selected="true"]');
  expect(selectedOptions).toHaveLength(1);
  expect(selectedOptions[0]?.textContent).toContain("git stash");
});
```

- [ ] **Step 2: Write a failing test proving plain ArrowUp still enters history when the suggestion bar is closed**

```tsx
it("keeps plain ArrowUp bound to history when the suggestion bar is closed", async () => {
  const paneState = createIdlePaneState();
  paneState.composerHistory = ["pwd", "git status"];

  act(() => {
    root.render(
      <DialogIdleComposer paneState={paneState} status="running" isActive={true} onSubmitCommand={vi.fn()} />,
    );
  });

  const input = host.querySelector("textarea") as HTMLTextAreaElement | null;
  expect(input).not.toBeNull();

  act(() => {
    input?.focus();
    input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  });

  await flush();

  expect((host.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe("git status");
});
```

- [ ] **Step 3: Run the focused test file to verify the new ArrowDown expectation fails before implementation**

Run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: FAIL on the new plain-arrow suggestion-navigation test because the component still requires `Ctrl+ArrowDown`.

### Task 3: Implement Plain Arrow Navigation In The Idle Composer

**Files:**
- Modify: `src/features/terminal/components/DialogIdleComposer.tsx`
- Test: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [ ] **Step 1: Add a focused guard for explicit suggestion-bar navigation**

```tsx
const canNavigateSuggestionBar =
  showSuggestionBar &&
  visibleSuggestions.length > 0 &&
  !isComposing;
```

- [ ] **Step 2: Handle plain ArrowUp and ArrowDown before history routing when the suggestion bar is open**

```tsx
if (event.key === "ArrowUp" && canNavigateSuggestionBar && visibleSuggestions.length > 1) {
  event.preventDefault();
  setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "previous"));
  return;
}

if (event.key === "ArrowDown" && canNavigateSuggestionBar && visibleSuggestions.length > 1) {
  event.preventDefault();
  setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "next"));
  return;
}
```

- [ ] **Step 3: Keep the existing compatibility shortcuts untouched**

```tsx
if (event.ctrlKey && event.key === "ArrowUp" && visibleSuggestions.length > 1) {
  event.preventDefault();
  setSuggestionIndex((index) => getNextPhraseSelection(index, visibleSuggestions.length, "previous"));
  return;
}
```

- [ ] **Step 4: Run the focused test file again**

Run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: PASS with the new plain-arrow navigation assertions and no regressions in existing idle-composer behavior.

- [ ] **Step 5: Commit the behavior change**

Run:

```bash
git add src/features/terminal/components/DialogIdleComposer.tsx src/features/terminal/components/DialogIdleComposer.test.tsx
git commit -m "feat: use plain arrows for open suggestion bar navigation"
```

Expected: a commit containing only the composer key-routing change and its tests.

### Task 4: Final Verification

**Files:**
- Verify: `src/features/terminal/components/DialogIdleComposer.tsx`
- Verify: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [ ] **Step 1: Run the focused idle-composer test file**

Run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: PASS with all tests green.

- [ ] **Step 2: Run typecheck for the branch**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Inspect the working tree**

Run:

```bash
git status --short
```

Expected: only the intended doc and composer changes are present, or a clean tree if commits were created.
