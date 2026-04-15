# PRAW Manus-Inspired Workspace Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign PRAW’s shell, pane, transcript, live console, and settings surfaces into a quieter graphite-blue dual-theme workspace while preserving existing terminal semantics.

**Architecture:** Keep the implementation token-first. First lock behavior with focused tests for new theme expectations and transcript labeling, then rebuild theme presets and shared app CSS, and finally tune component-level structure and copy where the new visual system needs sharper semantic boundaries.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri 2, plain CSS, Vitest, Rust unit tests (unchanged runtime unless already patched)

---

### Task 1: Lock the redesigned visual contract in tests

**Files:**
- Modify: `src/domain/theme/presets.test.ts`
- Modify: `src/features/terminal/components/DialogTranscript.test.tsx`

**Step 1: Write the failing theme test**

Add assertions that the refreshed light and dark presets expose the new graphite-blue direction:
- lighter, quieter surface hierarchy
- less absolute black in dark mode
- coherent accent values shared across app + terminal palettes

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/theme/presets.test.ts
```

Expected: FAIL because current preset values still reflect the older harsher palette.

**Step 3: Write the failing transcript label test**

Add a render test asserting non-command transcript blocks render the new context label (for example `shell output`) instead of `session output`.

**Step 4: Run test to verify it fails**

Run:

```bash
npm test -- src/features/terminal/components/DialogTranscript.test.tsx
```

Expected: FAIL because the current component still renders `session output`.

**Step 5: Commit**

```bash
git add src/domain/theme/presets.test.ts src/features/terminal/components/DialogTranscript.test.tsx
git commit -m "Lock the refreshed PRAW visual contract in tests"
```

### Task 2: Rebuild theme tokens around the graphite-blue system

**Files:**
- Modify: `src/domain/theme/presets.ts`
- Test: `src/domain/theme/presets.test.ts`

**Step 1: Implement the minimal token changes**

Update the theme preset definitions so:
- light theme uses cool whites / mist grays / graphite text / restrained blue accents
- dark theme uses deep graphite surfaces instead of pure black
- app and terminal palettes feel related
- sepia can remain available but should stay visually subordinate to the new primary direction

**Step 2: Run the targeted test**

Run:

```bash
npm test -- src/domain/theme/presets.test.ts
```

Expected: PASS

**Step 3: Sanity-check no config tests regressed**

Run:

```bash
npm test -- src/domain/config/model.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/domain/theme/presets.ts src/domain/theme/presets.test.ts
git commit -m "Rebuild PRAW theme tokens around a calmer graphite palette"
```

### Task 3: Refactor the shared app shell and pane chrome

**Files:**
- Modify: `src/app/styles.css`
- Modify: `src/app/App.tsx` (only if small structural hooks or labels are needed)
- Modify: `src/features/terminal/components/TerminalPane.tsx` (only if class hooks or tiny structure changes are required)

**Step 1: Refactor shell-level CSS**

Update shared CSS for:
- app background / surfaces / borders / overlays
- header composition
- button styling
- workspace canvas
- pane shells, headers, action clusters, overlays

Keep DOM changes minimal. Prefer class reuse and token-driven CSS.

**Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Run a targeted app render test if structure changed**

Run whichever existing affected test is closest to the touched component, for example:

```bash
npm test -- src/features/terminal/components/ClassicTerminalSurface.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/app/styles.css src/app/App.tsx src/features/terminal/components/TerminalPane.tsx
git commit -m "Give the workspace shell a more restrained product frame"
```

### Task 4: Redesign transcript, composer, and live console presentation

**Files:**
- Modify: `src/app/styles.css`
- Modify: `src/features/terminal/components/DialogTranscript.tsx`
- Modify: `src/features/terminal/components/DialogTerminalSurface.tsx` (only if supporting hooks are needed)
- Modify: `src/features/terminal/components/LiveCommandConsole.tsx`
- Test: `src/features/terminal/components/DialogTranscript.test.tsx`

**Step 1: Implement transcript and console refinements**

Apply the new visual system to:
- command blocks
- shell output block labeling + tone
- transcript spacing and separators
- jump-to-latest affordance
- live console header / body hierarchy
- idle composer framing

Keep behavior unchanged except for the revised context label and presentational structure.

**Step 2: Run transcript test**

Run:

```bash
npm test -- src/features/terminal/components/DialogTranscript.test.tsx
```

Expected: PASS

**Step 3: Run related dialog surface tests**

Run:

```bash
npm test -- src/features/terminal/components/DialogTerminalSurface.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/app/styles.css src/features/terminal/components/DialogTranscript.tsx src/features/terminal/components/DialogTerminalSurface.tsx src/features/terminal/components/LiveCommandConsole.tsx src/features/terminal/components/DialogTranscript.test.tsx
git commit -m "Make transcript and live console feel like intentional workspace surfaces"
```

### Task 5: Polish the settings panel to match the new system

**Files:**
- Modify: `src/app/styles.css`
- Modify: `src/features/config/components/SettingsPanel.tsx` (only if minor structure or copy hooks are needed)

**Step 1: Refine settings visuals**

Update:
- panel container
- section grouping
- field rhythm
- summary hierarchy
- toggle/select/input styling

Prefer CSS-only changes unless markup hooks are clearly needed.

**Step 2: Run targeted settings test if affected**

Run:

```bash
npm test -- src/domain/config/settings-panel-language.test.ts
```

Expected: PASS

**Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/app/styles.css src/features/config/components/SettingsPanel.tsx
git commit -m "Bring settings into the redesigned workspace language"
```

### Task 6: Full verification and release prep

**Files:**
- Modify: any final touched implementation files from prior tasks

**Step 1: Run all frontend tests**

```bash
npm test
```

Expected: PASS

**Step 2: Run typecheck and production build**

```bash
npm run typecheck
npm run build
```

Expected: PASS

**Step 3: Run backend tests to ensure the branch remains green**

```bash
cd src-tauri && cargo test
```

Expected: PASS

**Step 4: Review diff**

```bash
git status --short
git diff --stat
```

Expected: only intended redesign files remain modified.

**Step 5: Commit final integration pass**

```bash
git add src app src-tauri docs/plans/2026-04-14-manus-workspace-redesign.md
git commit -m "Land the first Manus-inspired workspace refresh for PRAW"
```

### Task 7: Publish branch and open PR

**Files:**
- none

**Step 1: Push branch**

```bash
git push -u origin feat/manus-workspace-redesign
```

**Step 2: Open PR**

Use GitHub CLI if available:

```bash
gh pr create --fill --base main --head feat/manus-workspace-redesign
```

If `--fill` is too weak, provide a manual title/body aligned with the design spec and verification evidence.

**Step 3: Capture PR URL**

Record the URL in the final handoff.
