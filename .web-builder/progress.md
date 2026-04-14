# PRAW Progress Log

## 2026-04-14

- Initialized `.web-builder/`
- Replaced the seed feature with a real sprint target: macOS adaptation + automated release
- Verified on macOS that:
  - `npm test` passes
  - `cargo test` passes
  - `npm run build` passes
- Verified that `npm run tauri build` reaches `.app` bundling but currently fails at DMG packaging
- Observed that the repository currently has no `.github/workflows/`
- Observed that shell integration is bash-only, which is the main obvious macOS gap
- Wrote `mac-baseline-audit.md` and marked `mac-baseline-audit` as done
- Added `.github/workflows/macos-release.yml` as phase-1 macOS release lane
- Updated `macos-release.yml` so merges to `main` publish macOS prereleases automatically and tags publish formal releases
- Wrote `mac-release-workflow.md` to document triggers, artifacts, and unresolved signing / DMG gaps
- Added zsh dialog integration support in Rust + TypeScript and marked `zsh-dialog-integration` as done
- Added a runtime PTY test proving zsh emits real OSC 133 shell markers during command execution
- Unified macOS default shell fallbacks so first-run defaults prefer `/bin/zsh` across front-end and back-end paths
