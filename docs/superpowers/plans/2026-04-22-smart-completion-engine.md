# Smart Completion Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PRAW's shallow rule-based completion with a PRAW-native, SQLite-backed smart completion engine shared by bash and zsh.

**Architecture:** Keep the UI interaction flow in the existing frontend hook, but move parsing, learning, and ranking into the Rust backend. Persist only command behavior signals into a global SQLite database and use those signals to bias family-specific completion providers.

**Tech Stack:** Rust + Tauri backend, SQLite via rusqlite, existing React/Zustand suggestion UI.

---

### Task 1: Add persistence and command telemetry plumbing
**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/completion/learning_store.rs`
- Modify: `src-tauri/src/commands/completion.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/domain/completion/types.ts`
- Modify: `src/lib/tauri/completion.ts`

- [ ] Add rusqlite dependency.
- [ ] Create SQLite schema/init helpers and telemetry write APIs.
- [ ] Expose Tauri commands for recording executed commands and accepted completions.
- [ ] Add frontend invoke wrappers and shared request types.

### Task 2: Rewrite backend completion parsing and ranking
**Files:**
- Modify: `src-tauri/src/completion/mod.rs`
- Create: `src-tauri/src/completion/parser.rs`

- [ ] Add shell-agnostic token parsing and slot analysis.
- [ ] Add learning-aware candidate providers and richer ranking.
- [ ] Keep response shape compatible with the existing frontend.

### Task 3: Implement high-value family providers
**Files:**
- Modify: `src-tauri/src/completion/mod.rs`

- [ ] Improve `cd`/path completion with learned paths.
- [ ] Improve git subcommand, branch, and file-slot completion.
- [ ] Improve docker, npm/pnpm/yarn, cargo, kubectl, and ssh completion.

### Task 4: Persist learning signals from the frontend
**Files:**
- Modify: `src/features/terminal/hooks/useSuggestionEngine.ts`

- [ ] Report completed commands once per renderer session.
- [ ] Report accepted suggestions on ghost/manual accept.
- [ ] Keep current session-memory behavior for immediate UX while backend learning accumulates.

### Task 5: Verify behavior
**Files:**
- Modify/create targeted tests under `src-tauri/src/completion/` and `src/features/terminal/hooks/`

- [ ] Add backend tests for parser, learning store, and smart ranking.
- [ ] Add frontend tests for telemetry or hook-side integration where practical.
- [ ] Run test, typecheck, build, and cargo verification.
