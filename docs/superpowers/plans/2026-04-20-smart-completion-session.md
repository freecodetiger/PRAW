# Smart Completion Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build current-session intelligent completion with in-memory context, source-separated orchestration, and explicit Tab-triggered natural-language command generation.

**Architecture:** Add pure domain modules for session memory, context pack building, input classification, and source orchestration. Keep React components thin: the composer consumes a normalized suggestion session and sends user actions into the orchestrator. Backend AI prompt code gains intent-mode request/response support without coupling to UI details.

**Tech Stack:** TypeScript, React 19, Vitest, Tauri invoke API, Rust, serde, reqwest.

---

## Precondition

The workspace currently contains uncommitted AI completion reliability changes. Before executing this plan, decide whether those changes are the baseline.

If they are the baseline, keep them and run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx src/features/terminal/lib/suggestion-engine.test.ts
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml ai::
```

Expected:

- frontend targeted tests pass
- TypeScript typecheck passes
- Rust AI tests pass

Do not revert existing user or agent changes. Do not start broad refactors until the baseline is verified.

## File Map

Create:

- `src/domain/suggestion/session-memory.ts`: Pure current-session memory reducer and caps.
- `src/domain/suggestion/context-pack.ts`: Pure context pack builder.
- `src/domain/suggestion/input-mode.ts`: Pure prefix/intent classifier.
- `src/domain/suggestion/orchestrator.ts`: Pure source merge, stale generation, and presentation model helpers.
- `src/features/terminal/lib/suggestion-sources.ts`: Frontend source adapters for local/workflow/AI calls.

Modify:

- `src/domain/suggestion/types.ts`: Add session memory, context pack, source state, reason/sourceId fields.
- `src/domain/suggestion/ranker.ts`: Add context-aware ranking hooks while preserving deterministic ordering.
- `src/features/terminal/hooks/useSuggestionEngine.ts`: Thin React lifecycle wrapper around orchestrator/source adapters.
- `src/features/terminal/components/DialogIdleComposer.tsx`: Route natural-language `Tab` into intent trigger.
- `src/features/terminal/components/SuggestionBar.tsx`: Render optional `reason`.
- `src/lib/tauri/ai.ts`: Add intent suggestion request wrapper.
- `src-tauri/src/ai/types.rs`: Add intent request shape and optional reason on suggestion item if needed.
- `src-tauri/src/ai/mod.rs`: Add intent prompt builder/parser support.
- `src-tauri/src/commands/ai.rs`: Add `request_ai_intent_suggestions`.
- `src-tauri/src/lib.rs`: Register the new Tauri command.

Test:

- `src/domain/suggestion/session-memory.test.ts`
- `src/domain/suggestion/context-pack.test.ts`
- `src/domain/suggestion/input-mode.test.ts`
- `src/domain/suggestion/orchestrator.test.ts`
- `src/features/terminal/lib/suggestion-sources.test.ts`
- `src/features/terminal/components/DialogIdleComposer.test.tsx`
- Rust AI tests in `src-tauri/src/ai/mod.rs`

---

### Task 1: Current-Session Memory

**Files:**
- Create: `src/domain/suggestion/session-memory.ts`
- Create: `src/domain/suggestion/session-memory.test.ts`
- Modify: `src/domain/suggestion/types.ts`

- [x] **Step 1: Write failing memory tests**

Add tests for:

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptySessionCompletionContext,
  recordCompletedCommand,
  recordAcceptedSuggestion,
  recordRejectedAiSuggestions,
} from "./session-memory";

describe("session-memory", () => {
  it("records completed commands and keeps the newest bounded entries", () => {
    let context = createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash");

    for (let index = 0; index < 55; index += 1) {
      context = recordCompletedCommand(context, {
        command: `echo ${index}`,
        cwd: "/workspace",
        exitCode: 0,
        output: `line ${index}`,
        completedAt: index,
      });
    }

    expect(context.recentCommands).toHaveLength(50);
    expect(context.recentCommands[0]?.command).toBe("echo 5");
    expect(context.recentCommands[49]?.command).toBe("echo 54");
    expect(context.cwdCommandStats["/workspace"]?.frequentCommands[0]?.command).toBe("echo 54");
  });

  it("records recent failures with short sanitized output summaries", () => {
    const context = recordCompletedCommand(
      createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
      {
        command: "npm test",
        cwd: "/workspace",
        exitCode: 1,
        output: "token=secret-key\nFAIL src/app.test.ts\n".repeat(200),
        completedAt: 10,
      },
    );

    expect(context.recentFailures).toHaveLength(1);
    expect(context.recentFailures[0]?.command).toBe("npm test");
    expect(context.recentFailures[0]?.outputSummary).toContain("FAIL src/app.test.ts");
    expect(context.recentFailures[0]?.outputSummary).not.toContain("secret-key");
    expect((context.recentFailures[0]?.outputSummary.length ?? 0) <= 2048).toBe(true);
  });

  it("records accepted and rejected suggestion feedback in memory only", () => {
    let context = createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash");
    context = recordAcceptedSuggestion(context, {
      source: "ai",
      kind: "intent",
      text: "lsof -i :3000",
      draft: "查看 3000 端口",
      cwd: "/workspace",
      acceptedAt: 20,
    });
    context = recordRejectedAiSuggestions(context, [
      {
        source: "ai",
        kind: "intent",
        text: "netstat -an",
        draft: "查看 3000 端口",
        cwd: "/workspace",
        rejectedAt: 21,
      },
    ]);

    expect(context.acceptedSuggestions).toHaveLength(1);
    expect(context.rejectedAiSuggestions).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run failing memory tests**

Run:

```bash
npm test -- src/domain/suggestion/session-memory.test.ts
```

Expected: fail because the module does not exist.

- [x] **Step 3: Add memory types**

Add these exported types to `src/domain/suggestion/types.ts`:

```ts
export interface CommandMemory {
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  completedAt?: number;
  outputSummary?: string;
  outputTail?: string;
}

export interface FailureMemory {
  command: string;
  cwd: string;
  exitCode: number;
  outputSummary: string;
  occurredAt: number;
}

export interface CwdCommandStat {
  command: string;
  count: number;
  lastUsedAt: number;
  successCount: number;
  failureCount: number;
}

export interface CwdCommandStats {
  cwd: string;
  frequentCommands: CwdCommandStat[];
}

export interface ProjectProfile {
  type: "node" | "rust" | "python" | "go" | "unknown";
  packageManager: string;
  scripts: string[];
  gitBranch?: string;
  gitStatusSummary: string[];
  toolAvailability: string[];
}

export interface SuggestionFeedback {
  source: CompletionCandidateSource;
  kind: SuggestionKind;
  text: string;
  draft: string;
  cwd: string;
  acceptedAt?: number;
  rejectedAt?: number;
}

export interface SessionCompletionContext {
  tabId: string;
  cwd: string;
  shell: string;
  recentCommands: CommandMemory[];
  recentFailures: FailureMemory[];
  cwdCommandStats: Record<string, CwdCommandStats>;
  acceptedSuggestions: SuggestionFeedback[];
  rejectedAiSuggestions: SuggestionFeedback[];
  projectProfile: ProjectProfile | null;
}
```

- [x] **Step 4: Implement pure memory reducer**

Create `src/domain/suggestion/session-memory.ts` with exported functions from the tests. Enforce caps:

- recent commands: 50
- recent failures: 10
- output summary/tail: 2048 chars
- feedback lists: 50
- frequent commands per cwd: 30

Use simple secret sanitization for `token=`, `password=`, `api_key=`, and `authorization:` patterns.

- [x] **Step 5: Verify memory tests pass**

Run:

```bash
npm test -- src/domain/suggestion/session-memory.test.ts
```

Expected: pass.

---

### Task 2: Input Mode and Context Pack

**Files:**
- Create: `src/domain/suggestion/input-mode.ts`
- Create: `src/domain/suggestion/input-mode.test.ts`
- Create: `src/domain/suggestion/context-pack.ts`
- Create: `src/domain/suggestion/context-pack.test.ts`
- Modify: `src/domain/suggestion/types.ts`

- [x] **Step 1: Write failing input-mode tests**

Create tests:

```ts
import { describe, expect, it } from "vitest";
import { classifyCompletionInput } from "./input-mode";

describe("input-mode", () => {
  it.each(["git ch", "npm r", "pnpm test", "cargo t", "./script.sh", "../bin/tool", "docker lo"])(
    "classifies %s as prefix",
    (draft) => {
      expect(classifyCompletionInput(draft, "/bin/bash")).toBe("prefix");
    },
  );

  it.each(["查看 3000 端口被谁占用", "启动这个项目", "提交当前改动", "find process using port 3000"])(
    "classifies %s as intent",
    (draft) => {
      expect(classifyCompletionInput(draft, "/bin/bash")).toBe("intent");
    },
  );

  it("keeps ambiguous short drafts in prefix mode", () => {
    expect(classifyCompletionInput("np", "/bin/bash")).toBe("prefix");
  });
});
```

- [x] **Step 2: Write failing context-pack tests**

Create tests that build a pack from session memory, project profile, and local candidates:

```ts
import { describe, expect, it } from "vitest";
import { buildAiCompletionContextPack } from "./context-pack";
import { createEmptySessionCompletionContext, recordCompletedCommand } from "./session-memory";

describe("context-pack", () => {
  it("builds a bounded prefix context pack with recent commands and local candidates", () => {
    const context = recordCompletedCommand(
      {
        ...createEmptySessionCompletionContext("tab:1", "/workspace", "/bin/bash"),
        projectProfile: {
          type: "node",
          packageManager: "pnpm",
          scripts: ["dev", "test", "build"],
          gitStatusSummary: [" M src/main.ts"],
          toolAvailability: ["git", "pnpm"],
        },
      },
      {
        command: "pnpm test",
        cwd: "/workspace",
        exitCode: 0,
        output: "passed",
        completedAt: 1,
      },
    );

    const pack = buildAiCompletionContextPack({
      draft: "pn",
      inputMode: "prefix",
      context,
      localCandidates: ["pnpm test", "pnpm run dev"],
    });

    expect(pack.inputMode).toBe("prefix");
    expect(pack.projectProfile.type).toBe("node");
    expect(pack.projectProfile.scripts).toEqual(["dev", "test", "build"]);
    expect(pack.recentSuccesses).toContain("pnpm test");
    expect(pack.localCandidates).toEqual(["pnpm test", "pnpm run dev"]);
  });
});
```

- [x] **Step 3: Run failing tests**

Run:

```bash
npm test -- src/domain/suggestion/input-mode.test.ts src/domain/suggestion/context-pack.test.ts
```

Expected: fail because modules do not exist.

- [x] **Step 4: Add context pack types**

Add `CompletionInputMode` and `AiCompletionContextPack` to `src/domain/suggestion/types.ts`.

- [x] **Step 5: Implement classifier and builder**

Implement pure functions:

```ts
export function classifyCompletionInput(draft: string, shell: string): CompletionInputMode;
export function buildAiCompletionContextPack(input: {
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  context: SessionCompletionContext;
  localCandidates: string[];
}): AiCompletionContextPack;
```

Keep all arrays bounded and deterministic.

- [x] **Step 6: Verify tests pass**

Run:

```bash
npm test -- src/domain/suggestion/input-mode.test.ts src/domain/suggestion/context-pack.test.ts
```

Expected: pass.

---

### Task 3: Backend Intent Request and Prompt

**Files:**
- Modify: `src-tauri/src/ai/types.rs`
- Modify: `src-tauri/src/ai/mod.rs`
- Modify: `src-tauri/src/ai/provider.rs`
- Modify: `src-tauri/src/ai/providers/openai_compatible.rs`
- Modify: provider wrappers under `src-tauri/src/ai/providers/*.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri/ai.ts`
- Modify: `src/domain/suggestion/types.ts`

- [x] **Step 1: Write failing Rust tests for intent prompt parsing**

Add tests in `src-tauri/src/ai/mod.rs` for:

- building an intent prompt includes natural-language draft and context pack fields
- parsing intent suggestions supports optional `reason`
- dangerous command filtering still rejects unsafe intent commands

Expected sample assertion:

```rust
assert!(user_message.content.contains("input_mode: intent"));
assert!(user_message.content.contains("natural_language_draft: 查看 3000 端口被谁占用"));
assert!(user_message.content.contains("project_type: node"));
```

- [x] **Step 2: Run failing Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ai::
```

Expected: fail because intent request support does not exist.

- [x] **Step 3: Add intent TypeScript API types**

Add:

```ts
export interface AiIntentSuggestionRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  draft: string;
  contextPack: AiCompletionContextPack;
  sessionId: string;
  userId: string;
}
```

Extend `SuggestionItem` with optional:

```ts
reason?: string;
sourceId?: string;
```

- [x] **Step 4: Add Rust intent request types**

Add `AiIntentSuggestionRequest` and optional `reason` / `source_id` fields to Rust suggestion item serialization.

- [x] **Step 5: Add provider trait method**

Add:

```rust
async fn suggest_intent(
    &self,
    request: AiIntentSuggestionRequest,
) -> Result<Option<SuggestionResponse>>;
```

Implement provider wrappers by reusing provider-specific message transports and the new intent prompt builder.

- [x] **Step 6: Register Tauri command**

Add `request_ai_intent_suggestions` to Rust commands, `tauri::generate_handler!`, and frontend wrapper `requestAiIntentSuggestions`.

- [x] **Step 7: Verify backend tests pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ai::
npm run typecheck
```

Expected: both pass.

---

### Task 4: Source Orchestrator Pure Domain

**Files:**
- Create: `src/domain/suggestion/orchestrator.ts`
- Create: `src/domain/suggestion/orchestrator.test.ts`
- Modify: `src/domain/suggestion/ranker.ts`
- Modify: `src/domain/suggestion/types.ts`

- [x] **Step 1: Write failing orchestrator tests**

Test:

- local suggestions appear immediately
- AI results from stale generations are ignored
- intent source runs only for `trigger: "tab"`
- intent mode favors AI intent candidates over prefix candidates
- accepted suggestion feedback raises similar candidate rank within current session

Example:

```ts
expect(nextSession.activeGroup).toBe("intent");
expect(nextSession.suggestions[0]).toMatchObject({
  source: "ai",
  kind: "intent",
  text: "lsof -i :3000",
});
```

- [x] **Step 2: Run failing orchestrator tests**

Run:

```bash
npm test -- src/domain/suggestion/orchestrator.test.ts
```

Expected: fail because orchestrator module does not exist.

- [x] **Step 3: Add source/session types**

Add:

```ts
export type SuggestionSourceId = "local" | "workflow" | "ai-inline" | "ai-intent" | "ai-recovery";
export type SuggestionSourceStateName = "idle" | "loading" | "success" | "empty" | "error" | "stale";

export interface SourceState {
  sourceId: SuggestionSourceId;
  state: SuggestionSourceStateName;
  message?: string;
}

export interface SuggestionSession {
  suggestions: SuggestionItem[];
  sources: Record<SuggestionSourceId, SourceState>;
  activeGroup: "inline" | "intent" | "recovery" | null;
  ghostSuggestion: SuggestionItem | null;
  generation: number;
}
```

- [x] **Step 4: Implement pure merge and stale handling**

Implement pure functions:

```ts
export function createEmptySuggestionSession(generation: number): SuggestionSession;
export function applySourceResult(session: SuggestionSession, result: SuggestionSourceResult): SuggestionSession;
export function buildSuggestionSessionPresentation(input: {
  draft: string;
  inputMode: CompletionInputMode | "recovery";
  generation: number;
  sourceResults: SuggestionSourceResult[];
  context: SessionCompletionContext;
}): SuggestionSession;
```

- [x] **Step 5: Verify orchestrator tests pass**

Run:

```bash
npm test -- src/domain/suggestion/orchestrator.test.ts
```

Expected: pass.

---

### Task 5: Frontend Source Adapters and Hook Integration

**Files:**
- Create: `src/features/terminal/lib/suggestion-sources.ts`
- Create: `src/features/terminal/lib/suggestion-sources.test.ts`
- Modify: `src/features/terminal/hooks/useSuggestionEngine.ts`
- Modify: `src/features/terminal/components/DialogIdleComposer.tsx`
- Modify: `src/features/terminal/components/SuggestionBar.tsx`
- Modify: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [x] **Step 1: Write failing adapter tests**

Test:

- local source maps local completion response to source result
- AI intent source is not called for automatic prefix trigger
- AI intent source is called for `trigger: "tab"` in intent mode
- AI intent source builds context pack and returns `AI · intent` suggestions

- [x] **Step 2: Run failing adapter tests**

Run:

```bash
npm test -- src/features/terminal/lib/suggestion-sources.test.ts
```

Expected: fail because source adapter module does not exist.

- [x] **Step 3: Implement source adapters**

Implement adapters that call:

- `requestLocalCompletion`
- `requestAiInlineSuggestions`
- `requestAiIntentSuggestions`
- `requestAiRecoverySuggestions`

Adapters return `SuggestionSourceResult` only. They do not mutate React state.

- [x] **Step 4: Refactor `useSuggestionEngine` into lifecycle wrapper**

Keep React responsibilities limited to:

- track draft/generation
- trigger source adapter calls
- update session memory after visible runtime changes
- pass source results through orchestrator
- expose accept/dismiss functions

Do not embed prompt construction or ranking inside the hook.

- [x] **Step 5: Add natural-language `Tab` component test**

Add to `DialogIdleComposer.test.tsx`:

- typing `查看 3000 端口被谁占用` and pressing `Tab` shows `AI loading...`
- first `Tab` does not replace textarea value
- resolved AI intent suggestion appears as `AI` + `intent`
- `ArrowRight` accepts it into the textarea
- command is not submitted until `Enter`

- [x] **Step 6: Run component and adapter tests**

Run:

```bash
npm test -- src/features/terminal/lib/suggestion-sources.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: pass.

---

### Task 6: Prompt Quality and Ranking Tuning

**Files:**
- Modify: `src-tauri/src/ai/mod.rs`
- Modify: `src/domain/suggestion/ranker.ts`
- Modify: `src/domain/suggestion/ranker.test.ts`
- Modify: `src/features/terminal/components/SuggestionBar.tsx`
- Modify: `src/app/styles.css`

- [x] **Step 1: Write failing tests for reason display and ranking**

Add tests that:

- AI intent suggestions can carry `reason`
- reason renders in the suggestion row
- accepted feedback boosts related commands in the same cwd
- prefix mode still favors append-compatible ghost suggestions

- [x] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/domain/suggestion/ranker.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: fail where reason/ranking behavior is missing.

- [x] **Step 3: Render optional reason**

Render `suggestion.reason` as short muted text under or after the command text. Keep the row compact.

- [x] **Step 4: Tune ranking with context**

Update ranker to accept optional `SessionCompletionContext` and apply small deterministic boosts for:

- accepted suggestions matching current cwd
- frequent cwd commands
- package script matches
- intent mode AI suggestions

Keep boosts bounded so local exact-prefix completions remain stable.

- [x] **Step 5: Verify ranking tests pass**

Run:

```bash
npm test -- src/domain/suggestion/ranker.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: pass.

---

### Task 7: Full Verification

**Files:**
- No intentional production edits unless verification exposes defects.

- [x] **Step 1: Run targeted frontend tests**

Run:

```bash
npm test -- src/domain/suggestion/session-memory.test.ts src/domain/suggestion/context-pack.test.ts src/domain/suggestion/input-mode.test.ts src/domain/suggestion/orchestrator.test.ts src/features/terminal/lib/suggestion-sources.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected: pass.

- [x] **Step 2: Run full frontend tests**

Run:

```bash
npm test
```

Expected: pass. Existing jsdom canvas warnings are acceptable only if exit code is 0.

- [x] **Step 3: Run TypeScript typecheck**

Run:

```bash
npm run typecheck
```

Expected: pass.

- [x] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: pass.

- [x] **Step 5: Check diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected:

- no whitespace errors
- changed files match the plan scope

---

## Completion Notes

This plan intentionally avoids disk persistence and long-term memory. It also avoids a vector database and full transcript storage. The first implementation should prove the architecture and interaction model with current-session memory only.

If implementation pressure rises, preserve the architecture boundaries first:

- keep source modules React-free
- keep context pack construction pure
- keep AI prompt builders out of UI code
- keep the composer as an interaction shell, not a business-logic owner
