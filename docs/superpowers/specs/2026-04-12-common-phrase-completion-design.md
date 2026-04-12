# Common Phrase Completion Design

Date: 2026-04-12
Project: PRAW
Scope: Dialog-mode common phrase ghost completion

## Goal

Add a user-configurable common phrase ghost completion feature for dialog mode only.

The feature must allow users to:

- import a `.txt` file of common phrases from Settings
- use whole-line prefix matching against the current dialog input
- start matching only after at least 2 input characters
- cycle matching candidates with `Ctrl+ArrowUp` and `Ctrl+ArrowDown`
- accept the current candidate with `Tab`
- preserve phrase usage priority across app restarts

This feature must not alter classic mode behavior or reintroduce the stability risks previously seen around classic-mode ghost completion.

## Non-Goals

- no classic-mode phrase completion
- no per-phrase inline editing UI in Settings
- no backend or PTY integration for phrase matching
- no shell-aware token completion
- no merge behavior when importing phrases; import replaces the existing phrase list

## Why This Design

This feature is fundamentally a static user-defined suggestion source. It does not require shell state, filesystem queries, PTY access, or model inference. Therefore, the cleanest design is a pure frontend implementation with persisted configuration.

That choice keeps the system decoupled:

- configuration owns phrase data
- a pure library owns matching and ranking
- the dialog input surface owns key handling and rendering
- existing local completion and AI completion remain unchanged

This avoids pushing a simple feature into the Rust/Tauri boundary and protects the high-availability path in classic mode.

## User Experience

### Import flow

In Settings, the user chooses a `.txt` file. Each non-empty line becomes one phrase.

Import rules:

- trim surrounding whitespace
- drop empty lines
- de-duplicate identical phrases while preserving first appearance order
- replace the current phrase library entirely
- reset stored phrase usage rankings to avoid stale weights for removed phrases

Settings should also expose:

- imported phrase count
- a clear button to remove all phrases
- import validation feedback when the file is empty or invalid

### Matching flow

When the dialog composer is focused and the current draft has at least 2 characters:

- phrase completion checks the entire draft as a prefix against imported phrases
- only phrases whose full string starts with the current draft are eligible
- if a phrase is exactly equal to the draft, it is not suggested

Example:

- draft: `cd p`
- phrase: `cd projects/`
- suggestion suffix: `rojects/`

### Candidate ordering

If multiple phrases match, candidates are ordered by:

1. most recently accepted phrase first
2. original import order as the stable tie-breaker

Recent usage must persist in the local app config so ordering survives restart.

### Key behavior

In dialog mode:

- `Ctrl+ArrowUp`: move to previous phrase candidate when phrase candidates are active
- `Ctrl+ArrowDown`: move to next phrase candidate when phrase candidates are active
- `Tab`: accept the currently selected phrase candidate

Behavior details:

- candidate navigation is cyclic
- changing the draft recomputes matches and resets selected candidate to index `0`
- browsing candidates does not update usage ranking
- accepting with `Tab` updates usage ranking for the accepted phrase

When no phrase candidates exist, current input behavior remains unchanged.

## Architecture

### 1. Config model

Extend terminal config with persisted phrase data.

Proposed additions:

```ts
interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  fontFamily: string;
  fontSize: number;
  preferredMode: TerminalPreferredMode;
  phrases: string[];
  phraseUsage: Record<string, number>;
}
```

Responsibilities:

- `phrases` stores the imported phrase library
- `phraseUsage` stores a monotonic usage score keyed by exact phrase

Normalization rules:

- `phrases` must be normalized as a deduplicated ordered list of non-empty strings
- `phraseUsage` must only keep entries for phrases that still exist
- unknown or invalid values fall back to defaults

### 2. Phrase completion library

Add a pure library module, for example:

`src/features/terminal/lib/phrase-completion.ts`

Responsibilities:

- normalize imported phrase text
- resolve whether phrase completion should be active for the current composer state
- compute ordered candidates from draft + phrase library + usage map
- return selected candidate and suffix
- compute next candidate index for up/down cycling

This module must not depend on React, Zustand, Tauri, or DOM APIs.

Suggested pure API shape:

```ts
interface PhraseMatch {
  phrase: string;
  suffix: string;
  usageScore: number;
  importIndex: number;
}

function normalizeImportedPhrases(rawText: string): string[];
function getPhraseMatches(
  draft: string,
  phrases: string[],
  usage: Record<string, number>,
): PhraseMatch[];
function cyclePhraseIndex(
  currentIndex: number,
  direction: "previous" | "next",
  total: number,
): number;
```

The exact function names can change, but the design constraint remains: matching and ranking stay pure and testable.

### 3. Dialog integration

Only `DialogTerminalSurface` should consume phrase completion.

Responsibilities in the React layer:

- request phrase matches from the pure library
- render the current phrase ghost suggestion
- intercept `Ctrl+ArrowUp`, `Ctrl+ArrowDown`, and `Tab` when phrase completion is active
- accept the selected phrase into the draft
- persist usage updates through the config store

Priority order for dialog ghost suggestion sources:

1. imported phrase completion
2. existing local completion
3. existing AI completion

Rationale:

- user-defined phrases are explicit intent and should win over inferred suggestions
- local and AI completion remain fallback sources

### 4. Settings integration

Extend `SettingsPanel` with a lightweight phrase-management section.

Preferred implementation:

- use a hidden `<input type="file" accept=".txt,text/plain">`
- read file contents with `File.text()`
- normalize phrases on the frontend
- write normalized data into terminal config

This avoids adding a new Tauri plugin or backend command for a simple local text import flow.

## Data Flow

### Import

1. User selects a `.txt` file in Settings.
2. UI reads file text.
3. Phrase normalization removes empties and duplicates.
4. Terminal config is patched with:
   - new `phrases`
   - reset `phraseUsage`
5. App config persistence writes the updated config through the existing bootstrap save path.

### Suggestion

1. Dialog draft changes.
2. Phrase completion library computes matching phrases.
3. If there is at least one candidate, the selected candidate renders as the ghost suggestion.
4. If no phrase candidate exists, existing local/AI completion logic remains eligible.

### Acceptance

1. User presses `Tab`.
2. Selected phrase replaces the current draft by appending its suffix.
3. The phrase receives the next usage score.
4. Updated `phraseUsage` is persisted.

## Error Handling

- If imported file contents produce zero valid phrases, preserve the existing phrase library and show an error message.
- If file reading fails, show an import error and do not mutate config.
- If all matching phrases equal the current draft exactly, show no phrase suggestion.
- If `Ctrl+ArrowUp` or `Ctrl+ArrowDown` is pressed without active phrase candidates, do nothing special and preserve current behavior.

## Testing Strategy

### Config tests

- resolves defaults when phrase fields are absent
- normalizes imported phrases to deduplicated non-empty entries
- drops `phraseUsage` keys for missing phrases
- preserves valid usage values for retained phrases

### Phrase library tests

- returns no candidates below the 2-character threshold
- matches full-line prefixes only
- excludes exact draft matches
- sorts by recent usage first, import order second
- cycles candidate index correctly in both directions
- returns the correct suffix for acceptance

### Dialog integration tests

- phrase suggestion overrides local/AI ghost suggestion when present
- `Ctrl+ArrowUp` and `Ctrl+ArrowDown` cycle active phrase candidates
- `Tab` accepts the selected phrase
- accepting a phrase updates persisted usage
- editing the draft resets the selected candidate index

### Regression boundary

- classic mode remains unaffected
- existing local completion tests remain valid
- AI ghost completion fallback still works when no phrase candidate exists

## Implementation Notes

- Keep phrase completion state local to the dialog composer rather than introducing a new global store.
- Keep matching synchronous and in-memory; the phrase library is small and user-managed.
- Keep usage scoring simple: a monotonically increasing integer per accepted phrase is sufficient and stable.

## Open Decisions Resolved

- scope: dialog mode only
- import format: `.txt`
- import semantics: replace existing list
- matching rule: whole-line prefix matching
- candidate ordering: recent usage first, import order second
- persistence: usage ranking survives restart

## Acceptance Criteria

The feature is complete when:

- a user can import a `.txt` phrase list from Settings
- imported phrases persist in app config
- dialog mode shows phrase ghost suggestions after 2 typed characters
- multiple phrase candidates can be cycled with `Ctrl+ArrowUp` and `Ctrl+ArrowDown`
- `Tab` accepts the selected phrase
- recently accepted phrases sort ahead of older ones across restart
- classic mode behavior remains unchanged
