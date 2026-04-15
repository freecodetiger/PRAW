# Common Phrase Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dialog-mode common phrase ghost completion with imported phrase libraries, prefix matching, candidate cycling, and persisted recent-use ranking.

**Architecture:** Keep phrase completion fully on the frontend. Persist phrase data in terminal config, implement matching and ranking as pure domain logic, then wire dialog-mode UI to prefer phrase suggestions over local and AI completions. Classic mode remains untouched.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tauri app config persistence

---

## File Map

- Modify: `src/domain/config/types.ts`
  Purpose: extend `TerminalConfig` with persisted phrase library fields.
- Modify: `src/domain/config/model.ts`
  Purpose: normalize new phrase fields and keep config backward-compatible.
- Modify: `src/domain/config/model.test.ts`
  Purpose: cover config normalization for phrase data.
- Modify: `src/features/config/state/app-config-store.test.ts`
  Purpose: verify terminal config patching preserves normalized phrase data.
- Create: `src/domain/terminal/phrase-completion.ts`
  Purpose: pure phrase normalization, matching, ranking, suffix, and cycling helpers.
- Create: `src/domain/terminal/phrase-completion.test.ts`
  Purpose: cover prefix matching, ordering, import parsing, and navigation logic.
- Modify: `src/features/terminal/lib/ghost-completion.ts`
  Purpose: support suppressing async local and AI completion when phrase completion is active.
- Modify: `src/features/terminal/hooks/useGhostCompletion.ts`
  Purpose: thread the suppression flag through the async ghost-completion hook.
- Modify: `src/features/terminal/components/DialogTerminalSurface.tsx`
  Purpose: integrate phrase suggestion rendering, key handling, and usage persistence.
- Modify: `src/features/config/components/SettingsPanel.tsx`
  Purpose: add `.txt` phrase import, clear action, count, and validation messages.
- Modify: `src/features/terminal/lib/ghost-completion.test.ts`
  Purpose: verify existing ghost completion still respects dialog-only behavior and new fallback semantics.

### Task 1: Extend persisted terminal config for phrase libraries

**Files:**
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write the failing config normalization tests**

```ts
it("normalizes imported phrase lists and drops stale usage entries", () => {
  expect(
    resolveAppConfig({
      terminal: {
        phrases: ["  codex  ", "claude", "codex", "   "],
        phraseUsage: {
          codex: 9,
          claude: 3,
          "cd projects/": 7,
        },
      },
    }),
  ).toEqual({
    terminal: {
      ...DEFAULT_APP_CONFIG.terminal,
      phrases: ["codex", "claude"],
      phraseUsage: {
        codex: 9,
        claude: 3,
      },
    },
    ai: DEFAULT_APP_CONFIG.ai,
  });
});

it("patches terminal phrase config through the app config store", () => {
  useAppConfigStore.getState().patchTerminalConfig({
    phrases: ["  codex  ", "claude", "codex"],
    phraseUsage: { codex: 4, claude: 2, ghost: 1 },
  });

  expect(useAppConfigStore.getState().config.terminal).toEqual({
    ...DEFAULT_APP_CONFIG.terminal,
    phrases: ["codex", "claude"],
    phraseUsage: { codex: 4, claude: 2 },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
```

Expected: FAIL with missing `phrases` and `phraseUsage` support in the config model.

- [ ] **Step 3: Write minimal implementation**

Update `src/domain/config/types.ts`:

```ts
export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  fontFamily: string;
  fontSize: number;
  preferredMode: TerminalPreferredMode;
  phrases: string[];
  phraseUsage: Record<string, number>;
}
```

Update `src/domain/config/model.ts`:

```ts
export const DEFAULT_APP_CONFIG: AppConfig = {
  terminal: {
    defaultShell: "/bin/bash",
    defaultCwd: "~",
    fontFamily:
      "\"CaskaydiaCove Nerd Font\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono\", \"JetBrains Mono\", monospace",
    fontSize: 14,
    preferredMode: "dialog",
    phrases: [],
    phraseUsage: {},
  },
  ai: {
    provider: "glm",
    model: "glm-5-flash",
    enabled: false,
    apiKey: "",
    themeColor: "#1f5eff",
    backgroundColor: "#eef4ff",
  },
};

function normalizePhraseList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const phrase = entry.trim();
    if (!phrase || seen.has(phrase)) {
      continue;
    }

    seen.add(phrase);
    normalized.push(phrase);
  }

  return normalized;
}

function normalizePhraseUsage(
  value: Record<string, number> | undefined,
  phrases: string[],
): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowed = new Set(phrases);
  const normalized: Record<string, number> = {};

  for (const [phrase, score] of Object.entries(value)) {
    if (!allowed.has(phrase) || typeof score !== "number" || !Number.isFinite(score) || score < 0) {
      continue;
    }

    normalized[phrase] = Math.floor(score);
  }

  return normalized;
}

export function resolveAppConfig(input?: AppConfigInput | null): AppConfig {
  const terminal = input?.terminal;
  const ai = input?.ai;
  const phrases = normalizePhraseList(terminal?.phrases);

  return {
    terminal: {
      defaultShell: normalizeString(terminal?.defaultShell, DEFAULT_APP_CONFIG.terminal.defaultShell),
      defaultCwd: normalizeString(terminal?.defaultCwd, DEFAULT_APP_CONFIG.terminal.defaultCwd),
      fontFamily: normalizeString(terminal?.fontFamily, DEFAULT_APP_CONFIG.terminal.fontFamily),
      fontSize: normalizeFontSize(terminal?.fontSize),
      preferredMode: normalizePreferredMode(terminal?.preferredMode),
      phrases,
      phraseUsage: normalizePhraseUsage(terminal?.phraseUsage, phrases),
    },
    ai: {
      provider: normalizeAiIdentifier(ai?.provider, DEFAULT_APP_CONFIG.ai.provider),
      model: normalizeAiIdentifier(ai?.model, DEFAULT_APP_CONFIG.ai.model),
      enabled: typeof ai?.enabled === "boolean" ? ai.enabled : DEFAULT_APP_CONFIG.ai.enabled,
      apiKey: normalizeOptionalString(ai?.apiKey),
      themeColor: normalizeHexColor(ai?.themeColor, DEFAULT_APP_CONFIG.ai.themeColor),
      backgroundColor: normalizeHexColor(ai?.backgroundColor, DEFAULT_APP_CONFIG.ai.backgroundColor),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "feat: persist terminal phrase libraries"
```

### Task 2: Build a pure phrase completion engine

**Files:**
- Create: `src/domain/terminal/phrase-completion.ts`
- Test: `src/domain/terminal/phrase-completion.test.ts`

- [ ] **Step 1: Write the failing engine tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getNextPhraseSelection,
  getPhraseMatches,
  normalizeImportedPhraseText,
} from "./phrase-completion";

describe("phrase-completion", () => {
  it("normalizes imported text into unique non-empty phrases", () => {
    expect(normalizeImportedPhraseText("codex\n\n claude \ncodex\ncd projects/\n")).toEqual([
      "codex",
      "claude",
      "cd projects/",
    ]);
  });

  it("treats CRLF text files the same as LF text files", () => {
    expect(normalizeImportedPhraseText("codex\r\nclaude\r\ncd projects/\r\n")).toEqual([
      "codex",
      "claude",
      "cd projects/",
    ]);
  });

  it("returns no matches below the minimum prefix length", () => {
    expect(getPhraseMatches("c", ["codex"], {})).toEqual([]);
  });

  it("matches whole-line prefixes and excludes exact matches", () => {
    expect(getPhraseMatches("cd p", ["cd projects/", "cd playground/"], {})).toMatchObject([
      { phrase: "cd projects/", suffix: "rojects/" },
      { phrase: "cd playground/", suffix: "layground/" },
    ]);
    expect(getPhraseMatches("codex", ["codex"], {})).toEqual([]);
  });

  it("sorts by recent usage first and import order second", () => {
    expect(
      getPhraseMatches(
        "cd ",
        ["cd playground/", "cd projects/", "cd /tmp"],
        { "cd projects/": 9, "cd playground/": 2 },
      ).map((entry) => entry.phrase),
    ).toEqual(["cd projects/", "cd playground/", "cd /tmp"]);
  });

  it("cycles candidate selection in both directions", () => {
    expect(getNextPhraseSelection(0, 3, "next")).toBe(1);
    expect(getNextPhraseSelection(2, 3, "next")).toBe(0);
    expect(getNextPhraseSelection(0, 3, "previous")).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- src/domain/terminal/phrase-completion.test.ts
```

Expected: FAIL with module or export errors because the engine does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/terminal/phrase-completion.ts`:

```ts
const MIN_PHRASE_PREFIX = 2;

export interface PhraseMatch {
  phrase: string;
  suffix: string;
  usageScore: number;
  importIndex: number;
}

export function normalizeImportedPhraseText(rawText: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const line of rawText.split(/\r?\n/u)) {
    const phrase = line.trim();
    if (!phrase || seen.has(phrase)) {
      continue;
    }

    seen.add(phrase);
    phrases.push(phrase);
  }

  return phrases;
}

export function getPhraseMatches(
  draft: string,
  phrases: string[],
  usage: Record<string, number>,
): PhraseMatch[] {
  if (draft.trim().length < MIN_PHRASE_PREFIX) {
    return [];
  }

  return phrases
    .map((phrase, importIndex) => ({
      phrase,
      importIndex,
      usageScore: usage[phrase] ?? -1,
    }))
    .filter(({ phrase }) => phrase.startsWith(draft) && phrase !== draft)
    .sort((left, right) => {
      if (left.usageScore !== right.usageScore) {
        return right.usageScore - left.usageScore;
      }

      return left.importIndex - right.importIndex;
    })
    .map(({ phrase, importIndex, usageScore }) => ({
      phrase,
      importIndex,
      usageScore,
      suffix: phrase.slice(draft.length),
    }));
}

export function getNextPhraseSelection(
  currentIndex: number,
  total: number,
  direction: "previous" | "next",
): number {
  if (total <= 0) {
    return 0;
  }

  return direction === "next"
    ? (currentIndex + 1) % total
    : (currentIndex - 1 + total) % total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- src/domain/terminal/phrase-completion.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/terminal/phrase-completion.ts src/domain/terminal/phrase-completion.test.ts
git commit -m "feat: add phrase completion engine"
```

### Task 3: Wire dialog-mode phrase completion ahead of async ghost completion

**Files:**
- Modify: `src/features/terminal/lib/ghost-completion.ts`
- Modify: `src/features/terminal/hooks/useGhostCompletion.ts`
- Modify: `src/features/terminal/components/DialogTerminalSurface.tsx`
- Test: `src/features/terminal/lib/ghost-completion.test.ts`

- [ ] **Step 1: Write the failing behavior test for async suppression**

Extend `src/features/terminal/lib/ghost-completion.test.ts` with:

```ts
it("suppresses async completion requests while phrase completion is active", () => {
  expect(
    shouldRequestLocalCompletion({
      ...baseContext,
      draft: "cd p",
      suppressAsyncCompletion: true,
    }),
  ).toBe(false);

  expect(
    buildLocalCompletionRequest({
      ...baseContext,
      draft: "cd p",
      suppressAsyncCompletion: true,
    }),
  ).toBeNull();

  expect(
    buildGhostCompletionRequest({
      ...baseContext,
      draft: "cd p",
      suppressAsyncCompletion: true,
    }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- src/features/terminal/lib/ghost-completion.test.ts
```

Expected: FAIL because `suppressAsyncCompletion` is not yet part of the ghost-completion context.

- [ ] **Step 3: Write minimal implementation**

Update `src/features/terminal/lib/ghost-completion.ts`:

```ts
export interface GhostCompletionContext {
  aiEnabled: boolean;
  apiKey: string;
  provider: CompletionRequest["provider"];
  model: string;
  shell: string;
  cwd: string;
  draft: string;
  recentCommands: string[];
  status: TerminalSessionStatus;
  mode: PaneRenderMode;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
  suppressAsyncCompletion?: boolean;
}

export function shouldRequestLocalCompletion(context: GhostCompletionContext): boolean {
  if (context.suppressAsyncCompletion) {
    return false;
  }

  if (context.status !== "running" || context.mode !== "dialog") {
    return false;
  }

  if (!context.cursorAtEnd || context.browsingHistory || context.isComposing || !context.isFocused) {
    return false;
  }

  return context.draft.trim().length >= MIN_COMPLETION_CHARS;
}
```

Update `src/features/terminal/hooks/useGhostCompletion.ts`:

```ts
interface UseGhostCompletionOptions {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  draft: string;
  cursorAtEnd: boolean;
  browsingHistory: boolean;
  isComposing: boolean;
  isFocused: boolean;
  disabled?: boolean;
}

export function useGhostCompletion({
  paneState,
  status,
  draft,
  cursorAtEnd,
  browsingHistory,
  isComposing,
  isFocused,
  disabled = false,
}: UseGhostCompletionOptions): GhostCompletionState {
  const aiConfig = useAppConfigStore((state) => state.config.ai);
  const [suggestion, setSuggestion] = useState("");
  const generationRef = useRef(0);

  const localRequest = buildLocalCompletionRequest({
    aiEnabled: aiConfig.enabled,
    apiKey: aiConfig.apiKey,
    provider: aiConfig.provider as CompletionRequest["provider"],
    model: aiConfig.model,
    shell: paneState.shell,
    cwd: paneState.cwd,
    draft,
    recentCommands: paneState.composerHistory,
    status,
    mode: paneState.mode,
    cursorAtEnd,
    browsingHistory,
    isComposing,
    isFocused,
    suppressAsyncCompletion: disabled,
  });
```

Update `src/features/terminal/components/DialogTerminalSurface.tsx`:

```ts
const terminalConfig = useAppConfigStore((state) => state.config.terminal);
const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
const [phraseIndex, setPhraseIndex] = useState(0);

const phraseMatches = useMemo(
  () => getPhraseMatches(draft, terminalConfig.phrases, terminalConfig.phraseUsage),
  [draft, terminalConfig.phrases, terminalConfig.phraseUsage],
);
const activePhrase = phraseMatches[phraseIndex] ?? null;

const { suggestion: ghostSuggestion, acceptSuggestion, clearSuggestion } = useGhostCompletion({
  paneState,
  status,
  draft,
  cursorAtEnd,
  browsingHistory: historyIndex !== null,
  isComposing,
  isFocused,
  disabled: phraseMatches.length > 0,
});

const suggestion = activePhrase?.suffix ?? ghostSuggestion;

useEffect(() => {
  setPhraseIndex(0);
}, [draft, phraseMatches.length]);
```

Insert key handling before history navigation:

```ts
if (event.ctrlKey && event.key === "ArrowUp" && phraseMatches.length > 1) {
  event.preventDefault();
  clearSuggestion();
  setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "previous"));
  return;
}

if (event.ctrlKey && event.key === "ArrowDown" && phraseMatches.length > 1) {
  event.preventDefault();
  clearSuggestion();
  setPhraseIndex((index) => getNextPhraseSelection(index, phraseMatches.length, "next"));
  return;
}

if (event.key === "Tab" && activePhrase && !isComposing) {
  event.preventDefault();
  const nextDraft = draft + activePhrase.suffix;
  const nextUsageScore = Math.max(0, ...Object.values(terminalConfig.phraseUsage)) + 1;

  patchTerminalConfig({
    phraseUsage: {
      ...terminalConfig.phraseUsage,
      [activePhrase.phrase]: nextUsageScore,
    },
  });

  setDraft(nextDraft);
  setHistoryIndex(null);
  setCursorAtEnd(true);
  setPhraseIndex(0);
  return;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- src/features/terminal/lib/ghost-completion.test.ts src/domain/terminal/phrase-completion.test.ts
```

Expected: PASS

Manual verification:
```text
1. Start the app in dialog mode.
2. Import phrases containing `codex`, `claude`, and `cd projects/`.
3. Type `cd p` and confirm the ghost suffix shows `rojects/`.
4. Add multiple `cd ...` phrases and confirm Ctrl+Up and Ctrl+Down cycle them.
5. Press Tab and confirm the selected phrase is accepted.
```

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/lib/ghost-completion.ts src/features/terminal/hooks/useGhostCompletion.ts src/features/terminal/components/DialogTerminalSurface.tsx src/features/terminal/lib/ghost-completion.test.ts
git commit -m "feat: add dialog phrase ghost completion"
```

### Task 4: Add Settings import and clear controls for phrase libraries

**Files:**
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Test: `src/domain/terminal/phrase-completion.test.ts`

- [ ] **Step 1: Verify import parsing coverage with a failing or newly-added regression test**

Add to `src/domain/terminal/phrase-completion.test.ts` if it does not already exist:

```ts
it("drops empty lines and preserves first appearance order", () => {
  expect(normalizeImportedPhraseText("claude\n\nclaude\ncodex\n")).toEqual([
    "claude",
    "codex",
  ]);
});
```

- [ ] **Step 2: Run the test to verify import parsing behavior**

Run:
```bash
npm test -- src/domain/terminal/phrase-completion.test.ts
```

Expected: PASS if Task 2 is complete, otherwise FAIL until import parsing is correct.

- [ ] **Step 3: Write minimal Settings implementation**

Update `src/features/config/components/SettingsPanel.tsx`:

```tsx
const fileInputRef = useRef<HTMLInputElement | null>(null);
const [phraseImportError, setPhraseImportError] = useState<string | null>(null);

const importPhraseFile = async (file: File | null) => {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const phrases = normalizeImportedPhraseText(text);

    if (phrases.length === 0) {
      setPhraseImportError("No valid phrases were found in the selected file.");
      return;
    }

    patchTerminalConfig({
      phrases,
      phraseUsage: {},
    });
    setPhraseImportError(null);
  } catch {
    setPhraseImportError("Failed to read the selected phrase file.");
  }
};
```

Render controls in the Terminal section:

```tsx
<div className="settings-section__title">
  <strong>Common Phrases</strong>
  <p>Import a text file with one phrase per line. Import replaces the current phrase list.</p>
</div>

<input
  ref={fileInputRef}
  type="file"
  accept=".txt,text/plain"
  hidden
  onChange={(event) => void importPhraseFile(event.target.files?.[0] ?? null)}
/>

<div className="settings-actions">
  <button className="button" type="button" onClick={() => fileInputRef.current?.click()}>
    Import Phrase File
  </button>
  <button
    className="button button--ghost"
    type="button"
    disabled={config.terminal.phrases.length === 0}
    onClick={() => patchTerminalConfig({ phrases: [], phraseUsage: {} })}
  >
    Clear Phrases
  </button>
</div>

<p className="settings-panel__summary">{config.terminal.phrases.length} phrases imported</p>
{phraseImportError ? <p className="settings-status settings-status--error">{phraseImportError}</p> : null}
```

- [ ] **Step 4: Run targeted tests and manual verification**

Run:
```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/domain/terminal/phrase-completion.test.ts
```

Expected: PASS

Manual verification:
```text
1. Open Settings.
2. Import a .txt file with repeated and blank lines.
3. Confirm the count reflects the deduplicated list.
4. Restart the app and confirm the phrase count persists.
5. Click Clear Phrases and confirm the count resets to 0.
```

- [ ] **Step 5: Commit**

```bash
git add src/features/config/components/SettingsPanel.tsx src/domain/terminal/phrase-completion.test.ts
git commit -m "feat: import phrase libraries from settings"
```

### Task 5: Final regression sweep

**Files:**
- Modify: none unless regressions are found
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`
- Test: `src/domain/terminal/phrase-completion.test.ts`
- Test: `src/features/terminal/lib/ghost-completion.test.ts`

- [ ] **Step 1: Run the focused automated test suite**

Run:
```bash
npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/domain/terminal/phrase-completion.test.ts src/features/terminal/lib/ghost-completion.test.ts
```

Expected: PASS

- [ ] **Step 2: Run type checking**

Run:
```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Run the production build**

Run:
```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Manual regression verification**

```text
1. Dialog mode: phrase completion works with Tab and Ctrl+Up or Ctrl+Down.
2. Dialog mode: when no phrase matches, existing local and AI ghost completion still appears.
3. Classic mode: no phrase completion UI appears and terminal input remains unchanged.
4. Restart after accepting a phrase multiple times and confirm candidate order reflects recent use.
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify phrase completion integration"
```
