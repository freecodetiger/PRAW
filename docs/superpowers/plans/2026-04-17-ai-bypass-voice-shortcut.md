# AI Bypass Voice Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable `toggleAiVoiceBypass` shortcut that only affects the active AI pane, opens the bypass composer, starts/stops voice capture, and leaves the transcript ready for manual send with `Enter`.

**Architecture:** Extend the existing terminal shortcut model and workspace shortcut resolver with one new semantic action, then route that action down into the active AI pane as a request signal. Reuse the existing `AiWorkflowSurface` voice state machine so keyboard and mouse paths converge on the same implementation, preserving raw-like stability and pane isolation.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + jsdom.

---

## File Structure

**Modify:**
- `/home/zpc/projects/praw/src/domain/config/terminal-shortcuts.ts` — add `toggleAiVoiceBypass` to the terminal shortcut config model, defaults, normalization, cloning, and duplicate detection
- `/home/zpc/projects/praw/src/domain/config/terminal-shortcuts.test.ts` — verify the new shortcut config participates in defaults and conflict handling
- `/home/zpc/projects/praw/src/domain/terminal/shortcuts.ts` — add a new workspace semantic action for the voice bypass shortcut
- `/home/zpc/projects/praw/src/domain/terminal/shortcuts.test.ts` — verify the resolver maps the new binding correctly and leaves other shortcuts unchanged
- `/home/zpc/projects/praw/src/features/config/lib/settings-panel-copy.ts` — add localized labels for the new shortcut
- `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.tsx` — surface the new shortcut recorder entry in Settings
- `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.test.tsx` — cover rendering and updating the new shortcut binding
- `/home/zpc/projects/praw/src/features/terminal/hooks/useWorkspaceShortcuts.ts` — detect the new semantic action and dispatch one active-pane callback
- `/home/zpc/projects/praw/src/features/terminal/components/TerminalWorkspace.tsx` — wire the new shortcut callback into the active tab routing path
- `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx` — translate the active-pane shortcut action into a prop signal for the block workspace surface
- `/home/zpc/projects/praw/src/features/terminal/components/BlockWorkspaceSurface.tsx` — forward the new voice shortcut request key into `AiWorkflowSurface`
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx` — interpret the request key as `open/start`, `stop`, or ignore-while-finalizing
- `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx` — cover keyboard-driven open/start/stop and unconfigured/finalizing behavior
- `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx` — verify the new request key is forwarded only for AI mode panes

**Create:**
- None

**Why this structure:**
- Shortcut persistence and conflict detection stay in the existing config model.
- Shortcut resolution stays in the existing domain shortcut resolver.
- Pane targeting stays in the workspace/component tree, not inside the global key listener.
- Voice state remains local to `AiWorkflowSurface`, which already owns the bypass composer and voice lifecycle.

### Task 1: Extend the Shortcut Model and Resolver Contract

**Files:**
- Modify: `/home/zpc/projects/praw/src/domain/config/terminal-shortcuts.ts`
- Modify: `/home/zpc/projects/praw/src/domain/config/terminal-shortcuts.test.ts`
- Modify: `/home/zpc/projects/praw/src/domain/terminal/shortcuts.ts`
- Modify: `/home/zpc/projects/praw/src/domain/terminal/shortcuts.test.ts`

- [ ] **Step 1: Write the failing domain tests for the new shortcut key**

Update `src/domain/config/terminal-shortcuts.test.ts` with expectations that the default config and conflict detection include `toggleAiVoiceBypass`:

```ts
it("provides the approved default pane action bindings", () => {
  expect(DEFAULT_TERMINAL_SHORTCUTS).toEqual({
    splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
    splitDown: { key: "]", ctrl: true, alt: true, shift: false, meta: false },
    editNote: { key: "\\", ctrl: true, alt: true, shift: false, meta: false },
    toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
    toggleAiVoiceBypass: { key: "/", ctrl: true, alt: true, shift: true, meta: false },
  });
});

it("finds conflicts involving the AI voice bypass shortcut", () => {
  expect(
    findShortcutConflict(
      DEFAULT_TERMINAL_SHORTCUTS,
      { key: "/", ctrl: true, alt: true, shift: true, meta: false },
      "splitRight",
    ),
  ).toBe("toggleAiVoiceBypass");
});
```

Update `src/domain/terminal/shortcuts.test.ts` with a new resolver expectation:

```ts
expect(
  resolveWorkspaceShortcut(
    {
      key: "/",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      metaKey: false,
    },
    DEFAULT_TERMINAL_SHORTCUTS,
  ),
).toEqual({ type: "toggle-ai-voice-bypass" });
```

- [ ] **Step 2: Run the focused domain test files to verify they fail**

Run:

```bash
npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/terminal/shortcuts.test.ts
```

Expected: FAIL because the model and resolver do not yet know about `toggleAiVoiceBypass`.

- [ ] **Step 3: Implement the new shortcut key in the config model**

Update `src/domain/config/terminal-shortcuts.ts`:

```ts
export interface TerminalShortcutConfig {
  splitRight: ShortcutBinding | null;
  splitDown: ShortcutBinding | null;
  editNote: ShortcutBinding | null;
  toggleFocusPane: ShortcutBinding | null;
  toggleAiVoiceBypass: ShortcutBinding | null;
}

export const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutConfig = {
  splitRight: { key: "[", ctrl: true, alt: true, shift: false, meta: false },
  splitDown: { key: "]", ctrl: true, alt: true, shift: false, meta: false },
  editNote: { key: "\\", ctrl: true, alt: true, shift: false, meta: false },
  toggleFocusPane: { key: "Enter", ctrl: true, alt: true, shift: false, meta: false },
  toggleAiVoiceBypass: { key: "/", ctrl: true, alt: true, shift: true, meta: false },
};
```

Also extend `normalizeTerminalShortcutConfig(...)` and `cloneShortcutConfig(...)` to include the new key.

- [ ] **Step 4: Implement the new workspace semantic action**

Update `src/domain/terminal/shortcuts.ts`:

```ts
export type WorkspaceShortcutAction =
  | { type: "focus-pane"; direction: FocusDirection }
  | { type: "split-right" }
  | { type: "split-down" }
  | { type: "edit-note" }
  | { type: "toggle-focus-pane" }
  | { type: "toggle-ai-voice-bypass" };
```

Extend `resolvePaneActionShortcut(...)`:

```ts
if (matchesShortcutBinding(event, shortcuts.toggleAiVoiceBypass)) {
  return { type: "toggle-ai-voice-bypass" };
}
```

- [ ] **Step 5: Run the focused domain tests again and make them green**

Run:

```bash
npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/terminal/shortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the domain shortcut contract**

Run:

```bash
git add src/domain/config/terminal-shortcuts.ts src/domain/config/terminal-shortcuts.test.ts src/domain/terminal/shortcuts.ts src/domain/terminal/shortcuts.test.ts
git commit -m "feat: add AI bypass voice shortcut contract"
```

### Task 2: Surface the Shortcut in Settings

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/config/lib/settings-panel-copy.ts`
- Modify: `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.tsx`
- Modify: `/home/zpc/projects/praw/src/features/config/components/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing settings test**

Add a settings test asserting the new shortcut label renders and updates the store:

```ts
it("renders and updates the AI voice bypass shortcut", () => {
  act(() => {
    root.render(<SettingsPanel />);
  });

  act(() => {
    host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(host.textContent).toContain("Toggle AI Voice Bypass");
});
```

- [ ] **Step 2: Run the focused settings test file to verify it fails**

Run:

```bash
npm test -- src/features/config/components/SettingsPanel.test.tsx
```

Expected: FAIL because the label and config key do not yet exist in the settings surface.

- [ ] **Step 3: Add localized labels and include the new shortcut key in Settings**

Update `src/features/config/lib/settings-panel-copy.ts` shortcut labels:

```ts
shortcutLabels: {
  splitRight: "Split Right",
  splitDown: "Split Down",
  editNote: "Edit Note",
  toggleFocusPane: "Toggle Focus Pane",
  toggleAiVoiceBypass: "Toggle AI Voice Bypass",
},
```

Chinese:

```ts
shortcutLabels: {
  splitRight: "向右分屏",
  splitDown: "向下分屏",
  editNote: "Edit Note",
  toggleFocusPane: "切换聚焦分屏",
  toggleAiVoiceBypass: "切换 AI 语音旁路",
},
```

Update `SettingsPanel.tsx`:

```ts
const SHORTCUT_KEYS: TerminalShortcutConfigKey[] = [
  "splitRight",
  "splitDown",
  "editNote",
  "toggleFocusPane",
  "toggleAiVoiceBypass",
];
```

- [ ] **Step 4: Run the focused settings test file again and make it green**

Run:

```bash
npm test -- src/features/config/components/SettingsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the settings surface update**

Run:

```bash
git add src/features/config/lib/settings-panel-copy.ts src/features/config/components/SettingsPanel.tsx src/features/config/components/SettingsPanel.test.tsx
git commit -m "feat: expose AI bypass voice shortcut in settings"
```

### Task 3: Route the New Shortcut Through the Workspace

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/hooks/useWorkspaceShortcuts.ts`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalWorkspace.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/BlockWorkspaceSurface.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/TerminalPane.test.tsx`

- [ ] **Step 1: Write the failing pane-forwarding test**

Update `TerminalPane.test.tsx` to verify the new request key is forwarded to the block workspace surface in AI mode:

```ts
expect(latestBlockWorkspaceProps?.voiceBypassToggleRequestKey).toBe(0);

act(() => {
  latestShortcutHandler?.({ type: "toggle-ai-voice-bypass" });
});

expect(latestBlockWorkspaceProps?.voiceBypassToggleRequestKey).toBe(1);
```

- [ ] **Step 2: Run the focused terminal pane test file to verify it fails**

Run:

```bash
npm test -- src/features/terminal/components/TerminalPane.test.tsx
```

Expected: FAIL because the new semantic action is not wired through the component tree.

- [ ] **Step 3: Extend the workspace shortcut hook with one callback**

Update `useWorkspaceShortcuts.ts`:

```ts
interface UseWorkspaceShortcutsOptions {
  focusAdjacentTab: (direction: "left" | "right" | "up" | "down") => void;
  splitActiveTab: (axis: "horizontal" | "vertical") => void;
  requestEditNoteForActiveTab: () => void;
  toggleFocusPane: () => void;
  toggleAiVoiceBypass: () => void;
  shortcuts: TerminalShortcutConfig;
}
```

In the switch:

```ts
case "toggle-ai-voice-bypass":
  toggleAiVoiceBypass();
  return;
```

- [ ] **Step 4: Route the semantic action into the active pane request key**

In `TerminalWorkspace.tsx`, pass a callback through the active-tab path.

In `TerminalPane.tsx`, add local state:

```ts
const [voiceBypassToggleRequestKey, setVoiceBypassToggleRequestKey] = useState(0);
```

Handle the semantic action by incrementing it only when the pane is AI mode. Forward it into `BlockWorkspaceSurface`:

```tsx
<BlockWorkspaceSurface
  ...
  quickPromptOpenRequestKey={quickPromptRequestKey}
  voiceBypassToggleRequestKey={voiceBypassToggleRequestKey}
/>
```

In `BlockWorkspaceSurface.tsx`, extend props and forward to `AiWorkflowSurface`:

```ts
interface BlockWorkspaceSurfaceProps {
  ...
  quickPromptOpenRequestKey?: number;
  voiceBypassToggleRequestKey?: number;
}
```

- [ ] **Step 5: Run the focused pane-forwarding test again and make it green**

Run:

```bash
npm test -- src/features/terminal/components/TerminalPane.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the workspace routing layer**

Run:

```bash
git add src/features/terminal/hooks/useWorkspaceShortcuts.ts src/features/terminal/components/TerminalWorkspace.tsx src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/BlockWorkspaceSurface.tsx src/features/terminal/components/TerminalPane.test.tsx
git commit -m "feat: route AI bypass voice shortcut to active pane"
```

### Task 4: Make AiWorkflowSurface Consume the Shortcut Request Safely

**Files:**
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `/home/zpc/projects/praw/src/features/terminal/components/AiWorkflowSurface.test.tsx`

- [ ] **Step 1: Write the failing AI surface tests for keyboard-driven voice bypass**

Add tests to `AiWorkflowSurface.test.tsx`:

```ts
it("opens bypass and starts recording when a voice bypass shortcut request arrives", async () => {
  useAppConfigStore.getState().patchSpeechConfig({
    enabled: true,
    apiKey: "speech-key",
    language: "auto",
  });

  renderSurface(root, createAgentWorkflowPaneState(), {
    voiceBypassToggleRequestKey: 1,
  });

  expect(host.querySelector('[aria-label="AI prompt input"]')).not.toBeNull();
  expect(voiceApi.startVoiceTranscription).toHaveBeenCalledTimes(1);
});

it("stops recording when a second voice bypass shortcut request arrives", async () => {
  useAppConfigStore.getState().patchSpeechConfig({
    enabled: true,
    apiKey: "speech-key",
    language: "auto",
  });

  const { rerender } = renderSurface(root, createAgentWorkflowPaneState(), {
    voiceBypassToggleRequestKey: 1,
  });

  await act(async () => {
    voiceApi.emitStarted({ sessionId: "voice-session-1" });
  });

  rerender({ voiceBypassToggleRequestKey: 2 });

  expect(voiceApi.stopVoiceTranscription).toHaveBeenCalledWith("voice-session-1");
});
```

Also add:

- unconfigured speech opens bypass but does not start
- finalizing ignores repeated shortcut requests

- [ ] **Step 2: Run the focused AI surface test file to verify it fails**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: FAIL because the surface does not yet understand a keyboard-driven voice request signal.

- [ ] **Step 3: Add the new request prop and map it into the existing voice state machine**

Update the props:

```ts
interface AiWorkflowSurfaceProps {
  ...
  quickPromptOpenRequestKey?: number;
  voiceBypassToggleRequestKey?: number;
}
```

Add an effect:

```ts
useEffect(() => {
  if (voiceBypassToggleRequestKey <= 0 || !showsBypassCapsule) {
    return;
  }

  setBypassPromptOpen(true);
  setBypassError(null);

  if (!voiceConfigured) {
    setVoiceStatus("Speech input is not configured.");
    return;
  }

  if (isVoiceFinalizing) {
    return;
  }

  if (voiceSessionIdRef.current) {
    void stopVoiceCapture();
    return;
  }

  void startVoiceCapture();
}, [voiceBypassToggleRequestKey, showsBypassCapsule, voiceConfigured, isVoiceFinalizing]);
```

The important rule is to reuse `startVoiceCapture()` and `stopVoiceCapture()` exactly as the mouse button does.

- [ ] **Step 4: Run the focused AI surface test file again and make it green**

Run:

```bash
npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the AI surface shortcut behavior**

Run:

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: drive AI bypass voice from keyboard shortcut"
```

### Task 5: Run Cross-Layer Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the focused shortcut and AI verification set**

Run:

```bash
npm test -- src/domain/config/terminal-shortcuts.test.ts src/domain/terminal/shortcuts.test.ts src/features/config/components/SettingsPanel.test.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the full frontend suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run the full desktop build verification**

Run:

```bash
npm run tauri build
```

Expected: PASS.

- [ ] **Step 4: Commit the final verified feature set**

Run:

```bash
git add src/domain/config/terminal-shortcuts.ts src/domain/config/terminal-shortcuts.test.ts src/domain/terminal/shortcuts.ts src/domain/terminal/shortcuts.test.ts src/features/config/lib/settings-panel-copy.ts src/features/config/components/SettingsPanel.tsx src/features/config/components/SettingsPanel.test.tsx src/features/terminal/hooks/useWorkspaceShortcuts.ts src/features/terminal/components/TerminalWorkspace.tsx src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/BlockWorkspaceSurface.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "feat: add AI bypass voice shortcut"
```

## Self-Review

- Spec coverage: the plan covers config, settings, resolver, workspace routing, active-pane targeting, AI surface state handling, and stability-oriented regression testing.
- Placeholder scan: every task includes explicit files, commands, and code snippets; no `TODO` or ambiguous “handle later” language remains.
- Type consistency: the same `toggleAiVoiceBypass`, `toggle-ai-voice-bypass`, and `voiceBypassToggleRequestKey` names are used consistently across config, resolver, routing, and AI surface tasks.
