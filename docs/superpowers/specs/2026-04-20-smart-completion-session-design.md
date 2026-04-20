# Smart Completion Session Design

Date: 2026-04-20
Project: PRAW
Scope: Current-session intelligent dialog completion

## Goal

Make dialog-mode completion smarter and more proactive while keeping the system maintainable.

The feature should support:

- command prefix completion that uses current-session context
- natural-language command intent generation after the user presses `Tab`
- current-session memory that is cleared when the app exits
- AI suggestions that never execute automatically
- source-separated, testable completion modules

The main product priority is command-prefix completion. Natural-language command generation is included because it shares the same input surface and AI context pipeline.

## Non-Goals

- no disk persistence for completion memory
- no cross-app-restart memory
- no vector database
- no full transcript storage
- no project-wide semantic indexing
- no automatic execution of AI commands
- no long-running background project scans
- no coupling to AI workflow mode or raw terminal runtime

## User Experience

### Command Prefix Completion

When the user types a shell-like prefix such as:

- `git ch`
- `np`
- `docker lo`
- `cargo t`

the composer should behave like a smart terminal completer:

1. Local and system candidates appear quickly.
2. AI inline candidates may appear after a short debounce.
3. AI candidates are marked as `AI`.
4. The ghost suggestion remains append-only.
5. `Tab` opens the candidate list.
6. `ArrowRight` or click accepts the selected candidate.
7. Accepting a candidate fills the input only; `Enter` is still required to execute.

### Natural-Language Intent

The same composer accepts natural-language text.

Examples:

- `查看 3000 端口被谁占用`
- `启动这个项目`
- `提交当前改动`
- `查一下最近失败的测试`
- `把当前分支同步到远端`

Natural-language input must not automatically trigger command generation. The user explicitly presses `Tab`.

On the first `Tab`:

1. The candidate list opens.
2. The AI intent source enters `loading`.
3. The input draft is not replaced.
4. When AI returns, one to five command candidates appear as `AI · intent`.
5. The user accepts a candidate with `ArrowRight` or click.
6. Acceptance fills the composer with the command but does not execute it.

This makes intent generation explicit and prevents accidental AI interference while typing prose.

### Recovery

When the most recent command failed and the draft is empty, recovery suggestions may appear as today, but they should use the same source/state architecture as other completion sources.

Recovery candidates remain replace-style suggestions.

## Architecture Decision

Build **Smart Completion Session v1** around an in-memory session context and a source orchestrator.

This replaces the current model where local completion, workflow suggestions, AI requests, ranking, UI state, and request lifecycle all live inside one React hook.

The new architecture has four bounded layers:

1. `SessionCompletionContext`
2. `ContextPackBuilder`
3. `SuggestionSource` implementations
4. `SuggestionOrchestrator`

The UI consumes only the orchestrator output.

## Maintainability Constraints

This design must keep the system highly decoupled.

Hard constraints:

- Source modules must not import React.
- Source modules must not mutate UI state directly.
- AI prompt builders must not know about React components.
- Context memory must not know about UI rendering.
- UI components must not know provider-specific API details.
- The orchestrator owns source coordination, cancellation, and stale-result handling.
- Ranking must operate on normalized `SuggestionItem` data only.
- Each source must be independently unit-testable with plain input and output.
- Current-session memory must be replaceable without changing UI components.

No single hook should become the owner of context extraction, memory, prompt construction, provider transport, ranking, and rendering.

## Session Completion Context

Add an in-memory model that summarizes useful completion facts for the current app session.

Suggested shape:

```ts
interface SessionCompletionContext {
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

### Command Memory

```ts
interface CommandMemory {
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  completedAt?: number;
  outputSummary?: string;
  outputTail?: string;
}
```

### Failure Memory

```ts
interface FailureMemory {
  command: string;
  cwd: string;
  exitCode: number;
  outputSummary: string;
  occurredAt: number;
}
```

### Project Profile

```ts
interface ProjectProfile {
  type: "node" | "rust" | "python" | "go" | "unknown";
  packageManager: string;
  scripts: string[];
  gitBranch?: string;
  gitStatusSummary: string[];
  toolAvailability: string[];
}
```

### Feedback

```ts
interface SuggestionFeedback {
  source: "ai" | "local" | "system";
  kind: "completion" | "correction" | "intent" | "recovery";
  text: string;
  draft: string;
  cwd: string;
  acceptedAt?: number;
  rejectedAt?: number;
}
```

Feedback should be used as a ranking hint inside the current app run only.

## Memory Lifecycle

The memory is current-session only.

It is initialized empty when the app starts. It is updated from runtime state and discarded when the app exits or reloads.

Allowed inputs:

- command blocks
- composer history
- local completion context snapshots
- accepted suggestion events
- dismissed AI suggestion events

Update rules:

- update memory after command completion, not after every output chunk
- keep bounded recent command lists
- keep bounded failure lists
- keep output summaries short
- sanitize secrets before storing output snippets in memory
- do not write memory to disk

Suggested caps:

- per-tab recent commands: 50
- per-cwd frequent command stats: 30 commands
- recent failures: 10
- output tail per failed command: 2 KB
- accepted/rejected feedback: 50 events

## Context Pack Builder

AI requests should not receive raw memory.

Before calling AI, build a compact `AiCompletionContextPack`.

```ts
interface AiCompletionContextPack {
  draft: string;
  inputMode: "prefix" | "intent" | "recovery";
  cwd: string;
  shell: string;
  recentCommands: string[];
  recentSuccesses: string[];
  recentFailures: Array<{
    command: string;
    exitCode: number;
    outputSummary: string;
  }>;
  frequentCommandsInCwd: string[];
  projectProfile: {
    type: "node" | "rust" | "python" | "go" | "unknown";
    scripts: string[];
    packageManager: string;
  };
  localCandidates: string[];
  userPreferenceHints: string[];
}
```

The builder must be fast and deterministic.

Hot-path constraints:

- no disk IO
- no network IO
- no full git diff
- no recursive project scan
- no AI summarization
- target runtime below 10 ms
- output prompt context stays small and bounded

If the pack cannot be built quickly, the system should degrade to the existing lightweight AI request.

## Input Mode Detection

Add a pure classifier:

```ts
type CompletionInputMode = "prefix" | "intent";

function classifyCompletionInput(draft: string, shell: string): CompletionInputMode;
```

Prefix examples:

- starts with a known executable or shell builtin
- starts with `./`, `/`, `~/`, `../`
- includes shell operators in a command-like shape
- matches common command prefixes such as `git`, `npm`, `pnpm`, `cargo`, `docker`, `kubectl`

Intent examples:

- contains CJK prose
- starts with common intent verbs such as `查看`, `启动`, `提交`, `修复`, `find`, `show`, `start`, `run`
- contains spaces but does not begin with a likely command
- resembles a task description rather than a shell command

The classifier should be conservative. Ambiguous text should stay in prefix mode unless the user presses `Tab` and no useful prefix candidates exist.

## Source Architecture

Define a small source interface:

```ts
interface SuggestionSourceRequest {
  draft: string;
  inputMode: "prefix" | "intent" | "recovery";
  trigger: "automatic" | "tab";
  context: SessionCompletionContext;
  localContext: CompletionContextSnapshot | null;
  localCandidates: SuggestionItem[];
  generation: number;
}

interface SuggestionSourceResult {
  sourceId: string;
  state: "idle" | "loading" | "success" | "empty" | "error" | "stale";
  suggestions: SuggestionItem[];
  message?: string;
}
```

Source implementations:

- `LocalSource`: history, paths, git, tools
- `WorkflowSource`: deterministic next-step suggestions
- `AiInlineSource`: shell prefix completion
- `AiIntentSource`: natural-language command generation
- `AiRecoverySource`: failed-command recovery

Each source should own only its data retrieval and suggestion generation. It should not decide final UI layout.

## Orchestrator

The `SuggestionOrchestrator` coordinates sources and produces one presentation model.

Responsibilities:

- create generation ids
- run local source first
- run AI inline automatically for prefix input
- run AI intent only after `Tab` for intent input
- run recovery when draft is empty and recent failure exists
- ignore stale async results
- merge source results
- expose per-source state
- produce the ghost candidate
- produce visible suggestions

Suggested public output:

```ts
interface SuggestionSession {
  suggestions: SuggestionItem[];
  sources: Record<string, SourceState>;
  activeGroup: "inline" | "intent" | "recovery" | null;
  ghostSuggestion: SuggestionItem | null;
}
```

UI components should depend on this shape, not on individual source internals.

## AI Prompt Modes

### Prefix Prompt

Used when input is shell-like.

Rules:

- user is typing a shell command prefix
- return safe executable commands
- prefer commands that continue or complete the draft
- use project scripts and recent successful commands
- do not explain
- do not require secrets
- never execute

### Intent Prompt

Used when the user presses `Tab` on natural-language input.

Rules:

- user wrote natural-language intent
- return one to five shell commands
- commands may replace the whole draft
- include a short reason per suggestion
- use cwd, project profile, recent failures, local candidates, and user preference hints
- do not execute
- avoid destructive commands
- do not require secrets

### Recovery Prompt

Used after command failure.

Rules:

- focus on correcting the failed command or suggesting diagnostics
- replace the draft
- include only commands that are safe to run
- prefer minimal corrective steps

## Suggestion Item Extension

The existing `SuggestionItem` can be extended with optional metadata:

```ts
interface SuggestionItem {
  id: string;
  text: string;
  kind: SuggestionKind;
  source: CompletionCandidateSource;
  score: number;
  group: SuggestionGroup;
  applyMode: SuggestionApplyMode;
  replacement: SuggestionReplacement;
  reason?: string;
  sourceId?: string;
}
```

`reason` is especially useful for AI intent suggestions:

- `based on current package scripts`
- `uses recent failed test output`
- `matches your frequent command in this directory`

Reasons should be short and optional.

## Ranking

Ranking should remain deterministic after source results are normalized.

Recommended ranking inputs:

- source priority
- suggestion kind
- source score
- draft affinity
- accepted suggestion feedback
- cwd frequent commands
- project script match
- recently failed or recently successful command context

AI should not automatically outrank local candidates. It should outrank local candidates only when the confidence is higher or the input mode is intent.

Intent mode should strongly favor `AI · intent` candidates because local prefix matching is usually irrelevant for prose.

## Safety

AI suggestions must be safe by construction and by filter.

Rules:

- never auto-execute
- reject multiline commands
- reject known destructive patterns
- reject commands requiring secret values
- do not include raw API keys or tokens in prompts
- sanitize command output before storing in session memory
- reduce confidence for commands with redirection, deletion, formatting, reboot, shutdown, or disk operations

For the first implementation, destructive commands should be rejected rather than shown with a warning.

## Data Flow

### Prefix Flow

1. User edits draft.
2. Input is classified as `prefix`.
3. Orchestrator starts a new generation.
4. Local source returns fast candidates and context.
5. Session context is refreshed from local context.
6. Context pack is built.
7. AI inline source runs after debounce.
8. Results are merged if generation is still current.
9. UI shows local/system/AI candidates with source state.

### Intent Flow

1. User enters natural-language draft.
2. Input is classified as `intent`.
3. Automatic prefix AI does not run.
4. User presses `Tab`.
5. Candidate list opens.
6. AI intent source enters `loading`.
7. Context pack is built with `inputMode: "intent"`.
8. AI returns command candidates.
9. User accepts one candidate into the composer.
10. User presses `Enter` to execute.

### Memory Update Flow

1. User submits command.
2. Command is recorded as started.
3. Command completes.
4. Command memory is updated with exit code and short output summary.
5. Failure memory is updated if exit code is non-zero.
6. CWD command stats are updated.
7. Future context packs include this information.

## Testing Strategy

### Pure Unit Tests

Add tests for:

- input mode classifier
- command memory caps
- failure memory summaries
- context pack truncation
- user preference hint generation
- source result merge behavior
- stale generation handling
- ranking with accepted suggestion feedback

### Source Tests

Each source should have tests that run without React:

- local source maps candidates correctly
- workflow source derives next-step suggestions
- AI inline source builds prefix requests
- AI intent source builds intent requests only on `Tab`
- recovery source uses recent failure context

### Component Tests

Composer tests should cover:

- natural-language draft plus `Tab` shows AI loading
- first `Tab` does not fill the input
- AI intent results appear as `AI · intent`
- `ArrowRight` accepts the highlighted command
- accepted command does not execute until `Enter`
- prefix completion still opens candidates with `Tab`

### Backend Tests

Backend tests should cover:

- intent prompt payload includes context pack fields
- prefix prompt keeps append-friendly behavior
- recovery prompt includes failure summary
- parser accepts structured suggestions with optional reasons
- sanitizer rejects dangerous commands

## Implementation Phases

### Phase 1: Session Context and Pack Builder

Add pure modules for current-session memory and context pack construction. Use existing runtime data, but do not change the composer interaction yet.

### Phase 2: Intent Detection and Tab Trigger

Add input classification and route natural-language `Tab` to AI intent generation. The first `Tab` opens/loading the candidate list only.

### Phase 3: Source Orchestrator

Split the suggestion engine into independent source modules coordinated by an orchestrator. Preserve existing visible behavior where possible.

### Phase 4: Prompt and Ranking Improvements

Update AI request payloads to use context packs, add optional reasons, and tune ranking with feedback and cwd command stats.

## Acceptance Criteria

1. Session completion memory exists only in memory and is cleared on app exit.
2. Command prefix completion uses session context.
3. Natural-language input plus `Tab` triggers AI intent suggestions.
4. First `Tab` for intent input does not auto-fill the command.
5. AI intent candidates are visible as `AI · intent`.
6. Accepting an AI command fills the input but does not execute it.
7. Source modules are testable without React.
8. UI consumes a normalized suggestion session model.
9. Context pack building does not perform disk IO, network IO, or recursive scans.
10. Tests cover classifier, context pack, orchestrator, source behavior, and composer interaction.

## Risks

- Input mode classification may misclassify short drafts.
- More AI paths can increase request volume.
- Orchestrator refactor can regress existing local completion behavior.
- Feedback-based ranking can overfit within a session.
- Context pack noise can reduce AI quality if not aggressively bounded.

Mitigations:

- keep classifier conservative
- trigger intent AI only on `Tab`
- preserve local-first behavior
- cap context sizes
- keep all source outputs observable in UI state
- write pure tests before replacing current hook behavior
