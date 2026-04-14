# Sprint 1 Contract

## Goal

Create a credible macOS compatibility and release baseline for PRAW.

## Inputs

- `spec.md`
- `feature_list.json`
- `design_tokens.json`
- Repository evidence from local macOS verification runs

## Exit Criteria

- Current macOS baseline is written down in repository state
- Release automation scope is explicit and reviewable
- Sprint 1 features are either implemented or split into concrete follow-up tasks
- Relevant feature `passes` values are updated based on evidence

## QA Notes

- Front-end tests pass on macOS
- Rust tests pass on macOS
- Production web build passes on macOS
- Full Tauri packaging / release automation still needs its own rollout lane
