# PRAW Product Spec

## Goal

PRAW is a Tauri + React + Rust desktop terminal workspace. The current delivery goal for this workstream is not a broad product rewrite; it is to make the existing Ubuntu-first codebase operationally ready for macOS development and macOS release automation.

## Users

- Primary user: developers who want a multi-pane terminal workspace with dialog/classic terminal modes and AI-assisted command UX.
- Secondary user: the maintainer shipping desktop builds across platforms.

## Core Jobs To Be Done

1. Run PRAW locally on macOS without unclear platform-specific breakage.
2. Identify which terminal UX features depend on bash/Linux assumptions and need adaptation on macOS.
3. Produce repeatable release artifacts for macOS through CI rather than manual local packaging.

## Non-Goals

- Re-architecting the whole terminal model.
- Expanding AI provider support as part of the macOS/release lane.
- Claiming full cross-platform parity before the macOS baseline is verified.

## Current Evidence

- Front-end tests pass on macOS.
- Rust tests pass on macOS.
- `npm run build` passes on macOS.
- The repository currently has no `.github/workflows/`, so automated release is not in place yet.
- Dialog shell integration is bash-only right now, which is a likely macOS usability gap because macOS commonly defaults to `zsh`.

## Release Bar

- Every feature in `feature_list.json` has explicit acceptance criteria
- Every shipped feature reaches `passes=true`
- macOS build/release assumptions are captured in repository state, not only in chat
