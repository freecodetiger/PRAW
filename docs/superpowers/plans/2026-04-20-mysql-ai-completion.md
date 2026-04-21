# MySQL AI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve dialog-mode AI completion so MySQL command prefixes and MySQL-oriented natural-language `Tab` requests produce better executable suggestions.

**Architecture:** Keep the current dialog suggestion architecture intact, and implement a MySQL-first vertical slice across input classification, candidate kind taxonomy, ranking, and AI prompt guidance. Inline ranking should preserve existing workflow behavior while adding a light database bias, and intent mode should remain explicit `Tab`-triggered natural language generation.

**Tech Stack:** TypeScript, React 19, Vitest, Rust, serde, reqwest, Tauri invoke API

---

## File Map

Modify:

- `src/domain/ai/types.ts`: add a `database` completion candidate kind.
- `src/domain/suggestion/input-mode.ts`: recognize MySQL CLI tools as command-like input.
- `src/domain/suggestion/input-mode.test.ts`: cover MySQL prefix vs natural-language intent classification.
- `src/domain/suggestion/ranker.ts`: add a light database-aware ranking bias.
- `src/domain/suggestion/ranker.test.ts`: verify database ranking without regressing workflow behavior.
- `src/features/terminal/components/DialogIdleComposer.test.tsx`: verify MySQL-oriented intent and prefix behavior in the live composer.
- `src-tauri/src/ai/mod.rs`: classify MySQL-family commands as database commands and add MySQL-aware prompt guidance for inline and intent suggestions.
- `src-tauri/src/ai/types.rs`: add `Database` completion kind.

No intentional production changes:

- `src/features/terminal/hooks/useSuggestionEngine.ts`: only touched if tests expose a MySQL-specific bug in orchestration.
- `src/features/terminal/lib/suggestion-sources.ts`: only touched if tests expose an adapter issue.

---

### Task 1: MySQL Prefix Classification

**Files:**
- Modify: `src/domain/suggestion/input-mode.ts`
- Modify: `src/domain/suggestion/input-mode.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/domain/suggestion/input-mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyCompletionInput } from "./input-mode";

describe("input-mode", () => {
  it("treats mysql family commands as prefix input", () => {
    expect(classifyCompletionInput("mysql -u root -p", "/bin/bash")).toBe("prefix");
    expect(classifyCompletionInput("mysqldump mydb", "/bin/bash")).toBe("prefix");
    expect(classifyCompletionInput("mysqladmin -u root ping", "/bin/bash")).toBe("prefix");
  });

  it("keeps mysql natural language requests in intent mode", () => {
    expect(classifyCompletionInput("连接本地 mysql", "/bin/bash")).toBe("intent");
    expect(classifyCompletionInput("导出 mysql 数据库", "/bin/bash")).toBe("intent");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/domain/suggestion/input-mode.test.ts`

Expected: FAIL because `mysql`, `mysqldump`, and `mysqladmin` are not in the command-like prefix set yet.

- [ ] **Step 3: Write the minimal implementation**

Update `src/domain/suggestion/input-mode.ts` so the command prefix set includes MySQL-family tools:

```ts
const COMMAND_PREFIXES = new Set([
  "apt",
  "brew",
  "cargo",
  "cat",
  "cd",
  "curl",
  "docker",
  "echo",
  "git",
  "go",
  "kubectl",
  "ls",
  "make",
  "mysql",
  "mysqladmin",
  "mysqldump",
  "npm",
  "pnpm",
  "python",
  "python3",
  "ssh",
  "tail",
  "vim",
  "yarn",
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/domain/suggestion/input-mode.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/suggestion/input-mode.ts src/domain/suggestion/input-mode.test.ts
git commit -m "feat: recognize mysql command prefixes"
```

---

### Task 2: Database Command Kind Taxonomy

**Files:**
- Modify: `src/domain/ai/types.ts`
- Modify: `src-tauri/src/ai/types.rs`
- Modify: `src-tauri/src/ai/mod.rs`

- [ ] **Step 1: Write the failing tests**

Add this TypeScript expectation where command kinds are asserted, and add the Rust classification test in `src-tauri/src/ai/mod.rs`:

```rust
#[test]
fn classifies_mysql_family_commands_as_database() {
    assert_eq!(
        super::classify_candidate_kind("mysql -u root -p"),
        super::CompletionCandidateKind::Database
    );
    assert_eq!(
        super::classify_candidate_kind("mysqldump mydb > mydb.sql"),
        super::CompletionCandidateKind::Database
    );
    assert_eq!(
        super::classify_candidate_kind("mysqladmin ping"),
        super::CompletionCandidateKind::Database
    );
}
```

And extend the TypeScript kind union in tests that assert candidate shapes:

```ts
const databaseCandidate = {
  text: "mysql -u root -p",
  source: "local" as const,
  score: 900,
  kind: "database" as const,
};
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml classifies_mysql_family_commands_as_database -- --exact`

Expected: FAIL because `Database` is not a valid completion kind yet.

- [ ] **Step 3: Write the minimal implementation**

Update `src/domain/ai/types.ts`:

```ts
export type CompletionCandidateKind =
  | "command"
  | "history"
  | "path"
  | "git"
  | "docker"
  | "ssh"
  | "systemctl"
  | "go"
  | "package"
  | "kubectl"
  | "network"
  | "database";
```

Update `src-tauri/src/ai/types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompletionCandidateKind {
    Command,
    History,
    Path,
    Git,
    Docker,
    Ssh,
    Systemctl,
    Go,
    Package,
    Kubectl,
    Network,
    Database,
}
```

Update `src-tauri/src/ai/mod.rs` inside `classify_candidate_kind`:

```rust
if command.starts_with("mysql ")
    || command.starts_with("mysqldump ")
    || command.starts_with("mysqladmin ")
{
    return CompletionCandidateKind::Database;
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml classifies_mysql_family_commands_as_database -- --exact
npm test -- src/features/terminal/lib/suggestion-engine.test.ts
```

Expected:

- Rust test PASS
- frontend test PASS with the new kind accepted

- [ ] **Step 5: Commit**

```bash
git add src/domain/ai/types.ts src-tauri/src/ai/types.rs src-tauri/src/ai/mod.rs
git commit -m "feat: classify mysql commands as database completions"
```

---

### Task 3: MySQL-Aware AI Prompt Guidance

**Files:**
- Modify: `src-tauri/src/ai/mod.rs`

- [ ] **Step 1: Write the failing Rust prompt tests**

Add prompt-content tests to `src-tauri/src/ai/mod.rs`:

```rust
#[test]
fn inline_prompt_mentions_mysql_family_guidance() {
    let request = super::AiInlineSuggestionRequest {
        provider: "glm".to_string(),
        model: "glm-4.7-flash".to_string(),
        api_key: "secret-key".to_string(),
        base_url: String::new(),
        draft: "mysql -u root".to_string(),
        pwd: "/workspace".to_string(),
        git_branch: Some("main".to_string()),
        git_status_summary: vec![],
        recent_history: vec!["mysql -u root -p".to_string()],
        cwd_summary: super::CwdSummary { dirs: vec!["src".to_string()], files: vec!["package.json".to_string()] },
        system_summary: super::SystemSummary {
            os: "ubuntu".to_string(),
            shell: "/bin/bash".to_string(),
            package_manager: "apt".to_string(),
        },
        tool_availability: vec!["mysql".to_string(), "mysqldump".to_string()],
        session_id: "sess-1".to_string(),
        user_id: "user-1".to_string(),
    };

    let (_, user) = super::build_inline_suggestion_prompt_messages(&request);
    let (system, _) = super::build_inline_suggestion_prompt_messages(&request);

    assert!(system.contains("If the draft already uses mysql, mysqldump, or mysqladmin"));
    assert!(system.contains("prefer continuing that MySQL tool family"));
    assert!(user.contains("draft: mysql -u root"));
}

#[test]
fn intent_prompt_mentions_mysql_natural_language_guidance() {
    let request = super::AiIntentSuggestionRequest {
        provider: "glm".to_string(),
        model: "glm-4.7-flash".to_string(),
        api_key: "secret-key".to_string(),
        base_url: String::new(),
        draft: "导出 mysql 数据库".to_string(),
        context_pack: super::AiCompletionContextPack {
            draft: "导出 mysql 数据库".to_string(),
            input_mode: "intent".to_string(),
            cwd: "/workspace".to_string(),
            shell: "/bin/bash".to_string(),
            recent_commands: vec!["mysql -u root -p".to_string()],
            recent_successes: vec!["mysqladmin ping".to_string()],
            recent_failures: vec![],
            frequent_commands_in_cwd: vec!["mysqldump mydb > mydb.sql".to_string()],
            project_profile: super::AiProjectProfileContext {
                project_type: "node".to_string(),
                scripts: vec![],
                package_manager: "pnpm".to_string(),
            },
            local_candidates: vec!["mysql -u root -p".to_string()],
            user_preference_hints: vec![],
        },
        session_id: "sess-1".to_string(),
        user_id: "user-1".to_string(),
    };

    let (system, _) = super::build_intent_suggestion_prompt_messages(&request);
    assert!(system.contains("Prefer mysql, mysqldump, or mysqladmin for MySQL-related requests"));
    assert!(system.contains("Favor directly executable commands"));
}
```

- [ ] **Step 2: Run the Rust tests to verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml inline_prompt_mentions_mysql_family_guidance -- --exact
cargo test --manifest-path src-tauri/Cargo.toml intent_prompt_mentions_mysql_natural_language_guidance -- --exact
```

Expected: FAIL because the prompt text does not mention MySQL-specific behavior yet.

- [ ] **Step 3: Write the minimal implementation**

Update `build_inline_suggestion_prompt_messages` system instructions:

```rust
[
    "You are a Linux terminal suggestion assistant.",
    "Return JSON object only with a suggestions array.",
    "Each suggestion must contain text, kind, and applyMode.",
    "Allowed kind values: completion, correction, intent.",
    "Allowed applyMode values: append, replace.",
    "Return up to 5 safe executable commands with no explanations.",
    "Never suggest destructive commands or commands that require secret values.",
    "Prefer completion when the current draft is already correct.",
    "If the draft already uses mysql, mysqldump, or mysqladmin, prefer continuing that MySQL tool family.",
    "Prefer executable connection, query, export, and health-check forms over switching to unrelated tools.",
]
```

Update `build_intent_suggestion_prompt_messages` system instructions:

```rust
[
    "You are a Linux terminal command intent assistant.",
    "The user wrote natural language and explicitly pressed Tab to request command suggestions.",
    "Return JSON object only with a suggestions array.",
    "Each suggestion must contain text, kind, applyMode, and an optional short reason.",
    "Use kind=intent and applyMode=replace for every suggestion.",
    "Return up to 5 safe executable shell commands with no explanations outside JSON.",
    "Never suggest destructive commands or commands that require secret values.",
    "Prefer mysql, mysqldump, or mysqladmin for MySQL-related requests.",
    "Favor directly executable commands when the request clearly asks for a MySQL action.",
]
```

- [ ] **Step 4: Run the Rust tests to verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml inline_prompt_mentions_mysql_family_guidance -- --exact
cargo test --manifest-path src-tauri/Cargo.toml intent_prompt_mentions_mysql_natural_language_guidance -- --exact
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ai/mod.rs
git commit -m "feat: add mysql-aware ai completion prompts"
```

---

### Task 4: Lightweight Database Ranking Bias

**Files:**
- Modify: `src/domain/suggestion/ranker.ts`
- Modify: `src/domain/suggestion/ranker.test.ts`

- [ ] **Step 1: Write the failing ranking test**

Add this test to `src/domain/suggestion/ranker.test.ts`:

```ts
it("lightly prefers mysql database completions over generic commands for mysql drafts", () => {
  const ranked = rankSuggestionItems({
    draft: "my",
    recentCommands: [],
    blocks: [],
    localContext: baseLocalContext,
    suggestions: [
      suggestion({
        id: "mysql",
        text: "mysql -u root -p",
        kind: "completion",
        source: "local",
        score: 900,
        replacement: { type: "append", suffix: "sql -u root -p" },
        sourceId: "local",
      }),
      suggestion({
        id: "mypy",
        text: "mypy src",
        kind: "completion",
        source: "local",
        score: 900,
        replacement: { type: "append", suffix: "py src" },
        sourceId: "local",
      }),
    ],
  });

  expect(ranked[0]?.text).toBe("mysql -u root -p");
});
```

Add the minimal kind information to the suggestion helper in the same test file:

```ts
kind: overrides.kind ?? "completion",
```

and for the MySQL case make sure the underlying completion candidate kind is `database` where that helper supports it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/domain/suggestion/ranker.test.ts`

Expected: FAIL because ranking does not currently distinguish database commands.

- [ ] **Step 3: Write the minimal implementation**

In `src/domain/suggestion/ranker.ts`, add a small helper:

```ts
function scoreDatabaseAffinity(draft: string, item: SuggestionItem): number {
  const trimmedDraft = draft.trim().toLowerCase();
  const text = item.text.toLowerCase();

  if (
    text.startsWith("mysql ")
    || text.startsWith("mysqldump ")
    || text.startsWith("mysqladmin ")
  ) {
    if (
      trimmedDraft.startsWith("my")
      || trimmedDraft.startsWith("mysql")
      || trimmedDraft.includes("mysql")
    ) {
      return 48;
    }
  }

  return 0;
}
```

Then apply it inside `scoreSuggestion`:

```ts
rank += scoreDatabaseAffinity(draft, item);
```

Keep the weight below the workflow and major affinity rules so Git continuation ranking does not regress.

- [ ] **Step 4: Run the focused and regression tests**

Run:

```bash
npm test -- src/domain/suggestion/ranker.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx
```

Expected:

- MySQL ranking test PASS
- existing workflow-oriented dialog tests still PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/suggestion/ranker.ts src/domain/suggestion/ranker.test.ts
git commit -m "feat: add mysql ranking bias"
```

---

### Task 5: Composer-Level MySQL Behavior

**Files:**
- Modify: `src/features/terminal/components/DialogIdleComposer.test.tsx`

- [ ] **Step 1: Write the failing composer tests**

Add one prefix-path test and one intent-path test.

Prefix-path test:

```tsx
it("shows mysql command continuation suggestions for mysql prefixes", async () => {
  requestLocalCompletion.mockResolvedValue({
    suggestions: [
      {
        text: "mysql -u root -p",
        source: "local",
        score: 950,
        kind: "database",
      },
      {
        text: "mysqldump mydb > mydb.sql",
        source: "local",
        score: 920,
        kind: "database",
      },
    ],
    context: createLocalCompletionContext(),
  });

  // render composer, type "my", open suggestion bar, assert mysql row is first
});
```

Intent-path test:

```tsx
it("requests mysql-oriented ai intent suggestions for mysql natural language", async () => {
  requestAiIntentSuggestions.mockResolvedValue({
    status: "success",
    suggestions: [
      {
        id: "ai:intent:mysql:1",
        text: "mysql -u root -p -e \"SHOW DATABASES;\"",
        kind: "intent",
        source: "ai",
        score: 900,
        group: "intent",
        applyMode: "replace",
        replacement: {
          type: "replace-all",
          value: "mysql -u root -p -e \"SHOW DATABASES;\"",
        },
        reason: "list databases",
      },
    ],
  });

  // render composer, type "查看 mysql 所有数据库", press Tab, assert the mysql command appears
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx`

Expected: FAIL because MySQL behavior is not yet represented clearly enough in the stack.

- [ ] **Step 3: Write the minimal implementation**

Do only the smallest code needed to satisfy the tests. The intended production changes are:

```ts
// no new composer logic by default
// rely on:
// - mysql prefix recognition in input-mode
// - mysql ranking bias in ranker
// - mysql-aware prompt guidance in Rust
// only change the composer or hook if the tests show an actual orchestration gap
```

If a hook fix is required, constrain it to existing MySQL data flow and do not broaden architecture changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx src/features/terminal/lib/suggestion-sources.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/DialogIdleComposer.test.tsx src/features/terminal/hooks/useSuggestionEngine.ts src/features/terminal/lib/suggestion-sources.ts
git commit -m "feat: improve mysql dialog completion behavior"
```

---

### Task 6: Final Verification

**Files:**
- No intentional production edits unless verification exposes a defect.

- [ ] **Step 1: Run the full suggestion-focused frontend suite**

Run:

```bash
npm test -- src/features/terminal/components/DialogIdleComposer.test.tsx src/features/terminal/lib/suggestion-engine.test.ts src/domain/suggestion/*.test.ts src/features/terminal/lib/suggestion-sources.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Run Rust AI tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ai::
```

Expected: PASS

- [ ] **Step 4: Check worktree**

Run:

```bash
git status --short
```

Expected: only intended MySQL completion files changed

- [ ] **Step 5: Commit**

```bash
git add src/domain/ai/types.ts src/domain/suggestion/input-mode.ts src/domain/suggestion/input-mode.test.ts src/domain/suggestion/ranker.ts src/domain/suggestion/ranker.test.ts src/features/terminal/components/DialogIdleComposer.test.tsx src-tauri/src/ai/mod.rs src-tauri/src/ai/types.rs
git commit -m "feat: improve mysql ai completion"
```
