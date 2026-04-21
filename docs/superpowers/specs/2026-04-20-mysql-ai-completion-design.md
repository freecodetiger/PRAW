# MySQL AI Completion Design

Date: 2026-04-20
Project: PRAW
Scope: Dialog-mode AI completion improvements for MySQL command entry and MySQL-oriented natural-language command generation

## Goal

Improve dialog-mode completion so MySQL work feels like a first-class shell workflow instead of a generic command surface.

The user-facing requirements are:

- treat `mysql` input as a normal command prefix flow instead of misclassifying it as natural language
- make `mysql`, `mysqldump`, and `mysqladmin` command continuation feel smarter
- improve Chinese natural-language to MySQL command suggestions when the user explicitly presses `Tab`
- bias suggestions toward directly executable MySQL commands rather than passive inspection-only suggestions
- preserve existing destructive-command safeguards at the shell-command layer

This phase targets the idle dialog composer and AI suggestion stack. It does not change PTY execution, credential storage, shell runtime, or non-MySQL database behavior.

## Current Behavior

The current completion system is broadly shell-aware, but database tooling is under-modeled.

First, MySQL CLI commands are not explicitly represented in input classification. The command-prefix detector recognizes common shell tools such as `git`, `docker`, `kubectl`, `npm`, and `python`, but not `mysql`, `mysqldump`, or `mysqladmin`. This makes it easier for MySQL drafts to lose the tighter command-prefix path and rely on weaker generic handling.

Second, command kinds do not include a database category. Local and AI candidates can still appear, but the ranking layer has no explicit way to treat database commands as a coherent command family.

Third, AI prompts are generic. They know about cwd, history, tools, and project context, but they do not explicitly tell the model how to behave when the draft already implies a MySQL workflow. This makes model output less stable in cases like:

- continuing a partially typed `mysql -h ... -u ...`
- choosing between `mysql`, `mysqldump`, and `mysqladmin`
- translating Chinese natural language such as “连接本地 mysql”, “导出数据库”, or “查看所有表” into an executable MySQL command

## Non-Goals

- no redesign of the overall suggestion architecture
- no persistence changes for current-session feedback
- no SQL AST parsing
- no schema introspection or project-level database metadata indexing
- no credential management or secret autofill
- no expansion to PostgreSQL, Redis, MongoDB, or SQLite in this phase
- no relaxation of shell-level destructive command filtering

## Decision

Use a MySQL-specific vertical slice.

The implementation should explicitly model MySQL CLI workflows at four layers:

1. input classification
2. completion-candidate kind classification
3. AI prompt guidance
4. ranking bias

This is smaller and safer than introducing a full generic database abstraction right now, and it directly addresses the user's active workflow.

## User Experience

### Prefix Completion

When the user starts typing a MySQL CLI command, the system should stay in prefix-completion mode and treat the draft as a command continuation problem.

Examples:

```text
mysql -h 127.0.0.1 -u root -p
mysql -u app -D mydb -e "SHOW TABLES;"
mysqldump -u root -p mydb > mydb.sql
mysqladmin -u root -p ping
```

The system should prefer suggestions that continue the current tool family instead of jumping to unrelated generic shell commands.

### Natural-Language Tab Intent

When the user writes Chinese natural language and explicitly presses `Tab`, intent suggestions should be more willing to produce MySQL commands.

Examples of desired intent behavior:

- “连接本地 mysql” -> `mysql -h 127.0.0.1 -u root -p`
- “查看所有数据库” -> `mysql -u root -p -e "SHOW DATABASES;"`
- “导出 mydb” -> `mysqldump -u root -p mydb > mydb.sql`
- “检查 mysql 是否在线” -> `mysqladmin -u root -p ping`

The bias should favor directly executable commands. It should not default to explanatory suggestions or abstract placeholders when the user explicitly requested command help.

### Safety

This phase should still reject shell commands that match existing destructive shell patterns. It does not attempt to detect every dangerous SQL statement. The completion layer should stay focused on shell-command safety, not database policy enforcement.

## Architecture

### Input Classification

Extend prefix detection so these commands are explicitly recognized as command-like:

- `mysql`
- `mysqldump`
- `mysqladmin`

This change belongs in the input classifier used by `useSuggestionEngine`, so typed MySQL commands stay on the prefix path and do not accidentally rely on intent-mode behavior.

### Completion Candidate Kind

Add a new completion-candidate kind:

```ts
type CompletionCandidateKind = ... | "database";
```

The following commands should classify to `database`:

- `mysql `
- `mysqldump `
- `mysqladmin `

The frontend and Rust backend should agree on this kind so AI and local candidates remain semantically aligned.

### AI Prompt Guidance

Add MySQL-aware prompt instructions in both inline and intent suggestion prompts.

Required behavior:

- if the draft already starts with `mysql`, `mysqldump`, or `mysqladmin`, prefer continuing that exact tool family
- prefer executable parameter completion over switching to another tool
- for intent-mode natural language related to MySQL, prefer `mysql`, `mysqldump`, and `mysqladmin` commands when they match the request
- allow directly executable MySQL-oriented commands by default
- avoid placeholders like `<database>` or `<host>` when a reasonable direct command form can be suggested

The prompt should still forbid shell-destructive commands and secret-dependent suggestions that cannot be executed safely without user-supplied credentials.

### Ranking

Introduce a lightweight ranking preference for `database` commands.

This bias should be small enough not to break existing Git workflow suggestions or previously tuned inline behavior. The ranking goal is not to force database commands above everything else; it is to make MySQL candidates more coherent when the draft and nearby context already indicate database work.

### Intent Hints

The current-session context pack should continue to include accepted and rejected suggestion hints. MySQL-focused intent results should naturally benefit from this without introducing new persistence behavior.

No new context-pack schema is required for this phase.

## Data Flow

### Prefix Path

1. User types a MySQL CLI draft such as `mysql -u root`.
2. Input classifier identifies the draft as command-like, not natural language.
3. Local completion and AI inline suggestion flow run as usual.
4. Candidate classification marks MySQL-family results as `database`.
5. Ranking applies existing draft affinity and session feedback, plus the small database bias.

### Intent Path

1. User types natural language such as “导出 mydb”.
2. Input classifier keeps this in `intent` mode.
3. User presses `Tab`.
4. Intent request uses the current context pack plus MySQL-aware prompt instructions.
5. Returned suggestions remain `kind=intent`, but the command text should favor MySQL-family executables when appropriate.

## Testing

Add coverage in these areas:

- input-mode tests:
  - `mysql -u root` stays `prefix`
  - `mysqldump mydb` stays `prefix`
  - natural-language MySQL requests remain `intent`
- AI/Rust classification tests:
  - `mysql ...`, `mysqldump ...`, and `mysqladmin ...` classify to `database`
- suggestion tests:
  - MySQL candidates rank sensibly against generic shell candidates
  - existing Git workflow ranking remains intact
- intent-source/UI tests:
  - Tab-triggered natural language can produce MySQL-oriented commands
  - rejected/accepted session hints still pass through
- Rust prompt tests:
  - inline and intent prompt content includes the MySQL-specific guidance

## Risks

The main risk is over-biasing MySQL and making the completion engine feel narrower than before. This is why the ranking change should stay light and why the MySQL specialization should live mainly in classification and prompt guidance.

Another risk is pretending to know credentials or database names. The system should not fabricate secrets. It can suggest direct executable forms, but they should stay generic enough to be honest and usable.

## Follow-Up

If this MySQL-first slice works well, the next phase can decide whether to:

- expand the same pattern to PostgreSQL and Redis
- move database-tool families into a generic command-taxonomy layer
- enrich the context pack with project-level database signals when they exist
