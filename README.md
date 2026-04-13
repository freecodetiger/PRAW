# PRAW

> A desktop terminal workspace for modern CLI workflows: multi-pane layouts, a Warp-like dialog flow, classic terminal fallback, and AI-assisted command UX built on top of a real shell.

PRAW is an experimental terminal application built with `Tauri + React + Rust`. It is not trying to replace the shell. It is trying to make shell-heavy work easier to organize, easier to read, and easier to extend with AI without breaking core terminal semantics.

## Why PRAW

Traditional terminals are powerful, but modern developer workflows usually spill across too many windows, too much context switching, and too little structure.

PRAW explores a different model:

- A terminal window as a workspace, not a single scrolling buffer
- Split panes that stay usable under real resize constraints
- A dialog-style command experience for readability and flow
- A classic terminal path when full terminal semantics matter
- AI-aware interactions layered on top of the terminal instead of replacing it

## What It Can Do Today

- Multi-pane terminal workspace with repeatable horizontal and vertical splits
- Dialog mode for structured command input and transcript-oriented reading
- Classic mode fallback for compatibility-sensitive terminal behavior
- Warp-inspired live command console flow for running commands in dialog mode
- AI workflow presentation states for agent-style CLI sessions
- Workflow-aware ghost completion and suggestion ranking in dialog mode
- Phrase completion for repeated command snippets
- Theme and appearance controls through the settings panel
- Stable bundled default mono font: `CaskaydiaCove Nerd Font Mono`
- Per-tab notes, pane actions, resize constraints, and workspace persistence
- English-first settings UI with in-app language switching support

## Current Status

PRAW is usable, but it is still an actively evolving project.

- The architecture is already serious enough to explore long-term terminal UX ideas
- Core workspace, dialog, completion, and settings systems are in place
- Ubuntu/Linux is the primary development target right now
- Interaction details, terminal compatibility, and AI behavior are still being refined

If you try it today, treat it as a fast-moving experimental product rather than a finished terminal replacement.

## Getting Started

### Prerequisites

- Node.js
- npm
- Rust toolchain
- Tauri development dependencies for your platform

For Linux, install the standard Tauri system packages first, then continue with the project setup.

### Run In Development

```bash
npm install
npm run tauri dev
```

### Run Frontend Only

```bash
npm run dev
```

### Quality Checks

```bash
npm run typecheck
npm test
npm run build
```

## Tech Stack

- `Tauri` for the desktop shell and native bridge
- `React 19` for interaction-heavy workspace UI
- `TypeScript` for front-end domain modeling
- `Rust` for terminal/runtime/system-side logic
- `xterm.js` for terminal rendering where terminal semantics require it
- `Zustand` for focused application and workspace state

## Architecture In One Screen

PRAW is intentionally split into clear layers:

- `React` handles workspace presentation, settings, pane interactions, dialog flows, and UI state
- `Rust` handles terminal sessions, system integration, persistence, AI/completion bridging, and runtime-sensitive logic
- `Tauri` keeps the contract between those two layers explicit

This separation matters because PRAW is not just a themed shell. It is a desktop terminal workspace with long-lived sessions, pane geometry, transcript logic, and AI-assisted input behaviors.

## Project Highlights

### 1. Dialog And Classic Are Separate On Purpose

PRAW does not try to fake one input model as the other.

- `dialog` mode is optimized for readability, structured history, suggestions, and command-centric workflows
- `classic` mode exists for cases where terminal compatibility and raw semantics win

That boundary is deliberate. It keeps advanced UX experiments from corrupting the baseline terminal experience.

### 2. Layout Is Built For Real Pane Work

The workspace model is designed around actual screen geometry and pane constraints, not just naive split history.

That matters for:

- repeated splits on the same axis
- stable resizing behavior
- edge constraints near headers and composers
- long-running usability in dense pane layouts

### 3. AI Is Treated As An Enhancement Layer

PRAW already includes the foundations for smarter command UX:

- ghost completion
- ranked suggestions
- recovery suggestions
- context-aware workflow continuation

The goal is not "chat inside a terminal". The goal is terminal-native assistance that still feels like command execution.

## Repository Structure

```text
src/                 React app, domain logic, workspace UI, settings, suggestion engine
src-tauri/           Rust backend, terminal runtime, native commands, persistence
project-insights/    Short write-ups on architectural choices and implementation ideas
docs/                Internal specs and implementation plans
```

## Design And Engineering Notes

If you want the reasoning behind the current architecture, start here:

- [Why Tauri + React + Rust](./project-insights/why-tauri-react-rust.md)
- [Why the workspace moved to a multi-container tree](./project-insights/why-multi-container-tree.md)
- [Ghost completion highlights](./project-insights/ghost-completion-highlights.md)
- [UI theme highlights](./project-insights/ui-theme-highlights.md)

## Roadmap Direction

The current direction is clear even though the product is still converging:

- Smarter workflow prediction beyond simple prefix history
- Better AI-assisted command recovery and intent handling
- Stronger dialog/classic compatibility boundaries
- More polished cross-platform behavior outside the current Ubuntu-first workflow
- Better packaging, onboarding, and public-facing project materials

## Contributing

The codebase is still moving quickly, but issues and pull requests are welcome if they align with the product direction.

Before making larger changes:

- read the architecture notes in [`project-insights/`](./project-insights)
- inspect the current domain boundaries in `src/domain` and `src/features`
- avoid flattening dialog/classic distinctions unless the change is explicitly about terminal semantics

## Philosophy

PRAW is built around a simple idea:

the terminal should stay powerful, but it does not need to stay primitive.
