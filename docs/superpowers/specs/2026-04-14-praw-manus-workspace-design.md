# PRAW Workspace Visual Language Redesign

## Summary

This design repositions PRAW from an experimental developer-facing terminal shell into a more composed desktop workspace product.

The target direction is **Manus-inspired restraint without copying Manus page structure**. PRAW should inherit Manus-like qualities—high whitespace, quiet surfaces, disciplined hierarchy, and restrained emphasis—while keeping PRAW’s own product semantics: workspace panes, transcript history, live command console, classic terminal fallback, and settings for long-running shell work.

The chosen direction is:

- **Approach**: Manus visual skeleton + PRAW product semantics
- **Palette direction**: graphite blue / cool gray
- **Theme strategy**: dual light + dark themes built from one shared design language

## Problem

PRAW currently works, but its visual system still reads more like an internal tool than a polished product workspace:

- pane chrome is heavy and tool-like
- active / special states rely on strong borders instead of controlled hierarchy
- transcript and session output feel closer to raw logs than composed work history
- settings are functional but visually dense
- the app shell does not yet communicate a premium, focused, modern workspace identity

There is also a specific product perception issue around `session output`: even when it is technically correct, it can feel abrupt and error-like because it appears as a low-context block in a largely empty transcript area.

The redesign should solve these perception issues without erasing PRAW’s identity as a terminal-native desktop workspace.

## Goals

- Give PRAW a distinct, premium, restrained visual language.
- Make the app feel closer to a modern workspace product than a raw developer utility.
- Keep the terminal product identity intact.
- Rebuild light and dark themes as one coherent system.
- Reduce visual harshness in pane chrome, transcript blocks, and settings surfaces.
- Make `session output`, transcript history, and live console feel intentional instead of incidental.
- Improve first-run and empty-ish states without hiding meaningful shell output.

## Non-Goals

- Copying the Manus homepage or marketing page structure verbatim.
- Turning PRAW into a landing-page-like or editorial website UI.
- Replacing terminal semantics with chat or document metaphors.
- Rebuilding the pane layout engine or terminal runtime.
- Introducing large animation systems, glows, or highly decorative visual effects.
- Adding major new product features during this redesign pass.

## Product Direction

### 1. Core Positioning

PRAW should feel like:

- a calm command workspace
- a premium desktop tool
- a structured shell environment

PRAW should not feel like:

- a retro hacker terminal
- a noisy AI dashboard
- a direct clone of Manus marketing UI

### 2. Design Principle

The guiding idea is:

> If the Manus design team designed a serious terminal workspace application, what would that look like?

That means borrowing from Manus:

- whitespace discipline
- visual quietness
- low-saturation surfaces
- elegant emphasis
- clean component proportion

But keeping PRAW-specific structure:

- panes remain panes
- transcript remains transcript
- live console remains a runtime surface
- classic terminal remains a true terminal

### 3. Theme Direction

The redesign uses one shared system across light and dark:

- **Light**: cool paper whites, mist gray surfaces, graphite text, muted blue accents
- **Dark**: deep graphite surfaces, cool low-contrast borders, soft desaturated blue accents

The app should never depend on loud contrast for identity. Accent is used sparingly and structurally.

## Visual Language

### Surface Model

The app should use a clearer surface ladder:

1. **App background** — quiet canvas tone
2. **Primary surface** — pane and settings base
3. **Muted surface** — subtle nested regions
4. **Interactive hover/focus surface** — only slightly stronger than resting state

The current system overuses hard borders. The redesign should shift the feeling from “boxed tool windows” to “calm modular surfaces.”

### Borders And Radius

- Borders become subtler and more consistent.
- Active state should rely more on contrast, inset treatment, and spacing rhythm than on thicker strokes.
- Radius should be present and consistent, but not soft or consumer-app playful.
- Shadow should remain minimal; border and tone do most of the work.

### Typography

Typography should become more product-like while preserving terminal readability:

- app shell labels become cleaner and quieter
- headings are lighter and less boxy
- metadata becomes more legible through spacing and tone, not size inflation
- transcript text remains terminal-respectful but visually more composed

The redesign is not a typography replatform. It is mainly about hierarchy, spacing, and visual cadence.

## App Shell

### Header

The top app header should be redesigned as a lightweight workspace frame:

- smaller visual footprint
- more breathing room
- less “developer tool titlebar” energy
- settings action styled as a refined secondary control

The header should communicate confidence and calm, not utility clutter.

### Workspace Canvas

The workspace background should read as a deliberate canvas rather than just the browser body.

It should:

- gently frame pane modules
- improve separation between global shell and local pane surfaces
- support both light and dark themes without looking flat or harsh

## Pane System

### Pane Container

Panes remain the product’s core structural unit, but their visual treatment changes:

- softer hierarchy
- more stable spacing
- quieter edges
- stronger sense of compositional balance

Current panes feel like engineering boxes. New panes should feel like professional workspace modules.

**Implementation refinement after visual review:**

- pane chrome should now lean closer to **GitHub’s repository/file-list card language** than to Manus’s softer card treatment
- pane headers should read like restrained utility bars: pale neutral background, thin divider, compact title weight, low-noise actions
- split seams should stay **very thin visually** even when the hit target remains larger for resizing
- seam endpoints must feel intentional and rounded without turning the split into a heavy pill or decorative rail

### Active Pane State

The active pane should no longer announce itself mainly through thicker borders.

Instead, active state should be communicated through a more premium combination of:

- slightly elevated contrast
- subtle edge emphasis
- clearer header/body relationship
- controlled accent use

### Agent Workflow State

Agent workflow panes still need distinction, but they should look like a special operating mode, not a warning state.

The redesign should keep visible differentiation while reducing the current harshness of thick accented edge treatment.

## Dialog Surface

The dialog surface is where this redesign matters most.

### Transcript

Transcript history should feel more like structured session memory than a raw stream dump.

The redesign should:

- increase whitespace between blocks
- reduce harsh separators
- improve the rhythm between command headers and outputs
- make command blocks feel intentionally grouped
- let syntax and semantic highlighting breathe without looking noisy

Command history should remain readable for serious shell work, but feel more curated.

### Session Output

`session output` should remain visible when meaningful shell output exists outside a user command context, but its presentation must change.

Decisions:

- do not suppress legitimate shell output by default
- do not style it like an error block
- relabel and/or visually demote it so it reads as shell context rather than failure
- reduce its first-screen abruptness through spacing, tone, and label treatment

Preferred direction:

- use quieter copy such as `shell output` or `startup output`
- style it as low-emphasis system context
- ensure a lone startup block does not visually dominate an otherwise empty workspace

### Idle Composer

The idle composer should become calmer and more premium:

- cleaner prompt line
- better spacing around input
- less visual noise around helper and suggestion surfaces
- focus treatment that feels intentional, not loud

### Jump-To-Latest

The jump affordance should remain available, but visually align with the quieter button system.

It should feel like a utility refinement, not a floating intervention.

## Live Command Console

The live console should look like a focused execution region, not a secondary terminal jammed into the page.

The redesign should:

- simplify the console header
- improve separation between command metadata and terminal surface
- reduce visual density in compact mode
- make running-state context feel composed and deliberate

Command, cwd, and terminal body should form a clear visual stack.

## Classic Terminal Surface

Classic mode remains a real terminal and must preserve compatibility-first behavior.

This redesign should not undermine terminal semantics. Visual changes should stay within:

- surface framing
- surrounding chrome
- spacing
- token alignment with the redesigned themes

Classic should still feel native to the new app language, but it must not lose its terminal credibility.

## Settings Panel

The settings panel should be redesigned from a dense utility drawer into a more refined system panel.

Desired changes:

- clearer section grouping
- better spacing between fields
- calmer controls
- more polished open/close behavior through layout and tone, not animation complexity
- stronger summary hierarchy at the top

The settings panel should feel like a serious application settings surface, not a debug form.

## Theme Token Strategy

This redesign should rebuild the visual language from tokens outward rather than patching scattered CSS values.

### App Tokens

Expected token groups:

- app background
- primary surface
- muted surface
- elevated surface
- text primary / secondary / tertiary
- border strong / border subtle
- overlay
- accent
- semantic status colors

### Transcript Tokens

Transcript and command history should gain their own structured token layer for:

- command text
- metadata
- system context output
- warning/error/success emphasis
- selection/focus accents

### Terminal Tokens

The xterm palette should be reviewed so terminal colors still read correctly inside the new shell language.

The app palette and terminal palette should feel related, not disconnected.

## File And Module Boundaries

Expected primary touchpoints:

- `src/domain/theme/presets.ts`
- `src/app/styles.css`
- `src/app/App.tsx`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/features/terminal/components/DialogTerminalSurface.tsx`
- `src/features/terminal/components/DialogTranscript.tsx`
- `src/features/terminal/components/LiveCommandConsole.tsx`
- `src/features/config/components/SettingsPanel.tsx`

Potential support touchpoints:

- terminal settings copy and summary helpers
- small className / copy-level adjustments for session output labeling

Implementation should prefer:

- token cleanup first
- shared shell-level styling updates second
- component-specific polish third

It should avoid large structural rewrites unless visual goals cannot be reached otherwise.

## Testing Strategy

### Automated

Add or update tests for the smallest behavior-level changes introduced by the redesign, especially when copy or rendering conditions change.

Examples:

- transcript labeling for non-command session blocks if copy changes
- theme preset normalization if token model changes
- component snapshot or render assertions only where they protect meaningful structure

The redesign should avoid gratuitous brittle style snapshots.

### Manual Verification

Manual review should confirm:

1. Light theme feels restrained, premium, and clearly readable.
2. Dark theme feels calm and focused, not flashy.
3. Pane hierarchy is clearer without relying on thick borders.
4. Agent workflow panes remain identifiable without looking alarm-like.
5. `session output` no longer feels like an accidental error banner.
6. Live console feels integrated and deliberate.
7. Settings panel feels more polished and less dense.
8. Classic mode still feels trustworthy and usable.

## Risks

- Over-indexing on Manus aesthetics could erase PRAW’s identity.
- Over-smoothing the UI could weaken information density for serious users.
- If accent usage becomes too timid, the interface may feel flat.
- If `session output` is visually demoted too far, useful startup context may become hard to notice.
- Large CSS-only changes without token discipline could increase inconsistency instead of reducing it.

## Recommendation

Implement the redesign as a **token-first visual refactor** with minimal behavior changes.

The winning direction is:

- Manus-inspired restraint
- graphite blue / cool gray dual-theme system
- quieter pane chrome
- more composed transcript and live console
- lower-friction but still visible system-context output

This is the most credible way to make PRAW feel premium without breaking its terminal-native product identity.
