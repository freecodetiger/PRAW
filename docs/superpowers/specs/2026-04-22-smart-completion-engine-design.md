# PRAW Smart Completion Engine Design

## Goal
Build a PRAW-native smart completion engine that feels closer to zsh plugin workflows while remaining shell-agnostic inside PRAW, persistent across app launches, and shared by bash and zsh.

## Constraints
- Completion must remain PRAW-owned rather than delegating to shell-specific plugin ecosystems.
- Learning should be global across the app, not project-local.
- Persistence is allowed through a lightweight database.
- Stored learning data must be limited to command behavior signals, not command output.
- The engine must stay highly available even when external CLIs or environments are missing.

## Architecture
### 1. Rust-owned completion core
Move intelligence into the Rust completion backend so bash and zsh share the same parsing, providers, and ranking. The frontend remains responsible for interaction and rendering.

### 2. SQLite-backed learning store
Persist global usage and acceptance signals in a lightweight SQLite database under app config storage. Use WAL mode, busy timeout, and schema initialization on demand.

### 3. Shell-agnostic parser
Parse the current draft into tokens, slot position, command family, and whether the cursor is starting a new token. This parser drives family-specific providers.

### 4. Multi-provider candidate generation
Combine:
- learned command names and accepted prefixes
- cwd-aware path suggestions
- git branches and file slots
- package scripts from package.json
- cargo subcommands and project-aware bias
- docker, kubectl, ssh, npm/pnpm/yarn family-specific subcommands
- command history and cwd command frequency

### 5. Learning signals
Persist only:
- executed command text (sanitized)
- cwd
- shell
- exit code
- timestamps
- accepted completion draft/text pairs

Do not persist command output.

## Ranking
Score candidates with:
- syntax/slot fit
- prefix fit
- learned acceptance for the same draft
- global command frequency
- cwd affinity
- recency
- success-rate bias
- project/tool affinity

## Reliability
- Never block completion on networked tools.
- Prefer filesystem reads and local SQLite queries.
- Treat missing tools/config files as empty providers.
- Sanitize secrets before persistence.

## First implementation wave
1. Global SQLite learning store and telemetry commands.
2. Parser + backend ranking rewrite.
3. High-value families: cd/path, git, docker, npm/pnpm/yarn, cargo, kubectl, ssh.
4. Frontend telemetry hooks for accepted suggestions and executed commands.
