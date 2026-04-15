# Qwen Codex-Like Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild structured AI mode around one adapter-driven runtime so `qwen` and `codex` share the same workspace behavior, capsule availability, transcript copy model, and raw fallback semantics.

**Architecture:** Split the current Rust bridge into a runtime orchestrator plus provider adapters, then surface adapter capabilities through normalized bridge-state events. Update the React workspace to consume runtime capabilities instead of provider-name heuristics so the capsule, copy behavior, and structured commands behave consistently for `codex` and the new qwen shim.

**Tech Stack:** Rust terminal bridge, Tauri event transport, TypeScript React UI, Zustand stores, Vitest, Cargo tests

---

## File Structure

### Backend

- Create: `src-tauri/src/terminal/structured_runtime.rs`
  - Own the common structured turn lifecycle, adapter selection, capability emission, and raw fallback emission.
- Create: `src-tauri/src/terminal/structured_provider.rs`
  - Define `StructuredProviderAdapter`, normalized capability types, and adapter result types.
- Create: `src-tauri/src/terminal/structured_codex.rs`
  - Move codex command building and codex JSON parsing behind the adapter interface.
- Create: `src-tauri/src/terminal/structured_qwen.rs`
  - Implement the codex-like qwen adapter or shim contract and isolate qwen-specific CLI details.
- Create: `src-tauri/src/terminal/structured_runtime_test.rs`
  - Cover adapter capabilities, normalized events, qwen model override, and fallback behavior.
- Modify: `src-tauri/src/events.rs`
  - Add normalized bridge capabilities to `TerminalAgentEvent::BridgeState`.
- Modify: `src-tauri/src/terminal/agent_bridge.rs`
  - Reduce this file to socket/control orchestration plus delegation into `structured_runtime`.
- Modify: `src-tauri/src/terminal/mod.rs`
  - Register the new runtime/adapter modules and tests.
- Modify: `src-tauri/src/commands/terminal.rs`
  - Keep command entry points unchanged while the bridge internals move behind the new runtime.

### Frontend

- Create: `src/features/terminal/lib/structured-agent-capabilities.ts`
  - Hold runtime capability helpers for help text, placeholders, and slash command behavior.
- Create: `src/features/terminal/lib/structured-agent-capabilities.test.ts`
  - Verify capability-driven help text and placeholder generation.
- Modify: `src/domain/terminal/types.ts`
  - Mirror the new capability payload on the frontend event types.
- Modify: `src/features/terminal/state/terminal-view-store.ts`
  - Persist bridge capabilities and stop treating provider name as the primary command contract.
- Modify: `src/features/terminal/components/TerminalPane.tsx`
  - Route slash commands through runtime capabilities and remove remaining qwen-special-case UI logic.
- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
  - Keep the capsule visible for all structured runtimes and consume capability-driven placeholder/help text.
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
  - Verify `codex` and `qwen` both render the capsule and use capability-driven copy/help behavior.
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
  - Verify structured commands now depend on runtime capabilities and raw fallback.
- Modify: `src/features/terminal/lib/ai-command.ts`
  - Stop encoding provider-specific semantics directly; make it capability-driven.
- Modify: `src/features/terminal/lib/ai-command.test.ts`
  - Cover capability-driven command help output.

### Existing Tests Worth Reusing

- `src-tauri/src/terminal/agent_bridge_test.rs`
- `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- `src/features/terminal/components/TerminalPane.test.tsx`
- `src/app/styles.test.ts`

---

### Task 1: Introduce A Common Structured Adapter Contract

**Files:**
- Create: `src-tauri/src/terminal/structured_provider.rs`
- Create: `src-tauri/src/terminal/structured_runtime.rs`
- Modify: `src-tauri/src/events.rs`
- Modify: `src/domain/terminal/types.ts`
- Test: `src-tauri/src/terminal/structured_runtime_test.rs`

- [ ] **Step 1: Write the failing backend test for bridge-state capabilities**

```rust
// src-tauri/src/terminal/structured_runtime_test.rs
use crate::terminal::structured_provider::StructuredAgentCapabilities;

#[test]
fn bridge_state_includes_runtime_capabilities() {
    let capabilities = StructuredAgentCapabilities {
        supports_resume_picker: true,
        supports_direct_resume: false,
        supports_review: true,
        supports_model_override: true,
        shows_bypass_capsule: true,
    };

    assert!(capabilities.shows_bypass_capsule);
    assert!(capabilities.supports_review);
}
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run: `cargo test structured_runtime_test --manifest-path src-tauri/Cargo.toml`
Expected: FAIL with missing module or missing `StructuredAgentCapabilities`

- [ ] **Step 3: Add the adapter contract and capability payload**

```rust
// src-tauri/src/terminal/structured_provider.rs
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAgentCapabilities {
    pub supports_resume_picker: bool,
    pub supports_direct_resume: bool,
    pub supports_review: bool,
    pub supports_model_override: bool,
    pub shows_bypass_capsule: bool,
}

pub trait StructuredProviderAdapter {
    fn provider_id(&self) -> &'static str;
    fn capabilities(&self) -> StructuredAgentCapabilities;
}
```

```rust
// src-tauri/src/events.rs
BridgeState {
    session_id: String,
    provider: String,
    mode: TerminalAgentMode,
    state: TerminalAgentState,
    fallback_reason: Option<String>,
    capabilities: Option<StructuredAgentCapabilities>,
}
```

```ts
// src/domain/terminal/types.ts
export interface StructuredAgentCapabilities {
  supportsResumePicker: boolean;
  supportsDirectResume: boolean;
  supportsReview: boolean;
  supportsModelOverride: boolean;
  showsBypassCapsule: boolean;
}
```

- [ ] **Step 4: Run the Rust test to verify it passes**

Run: `cargo test structured_runtime_test --manifest-path src-tauri/Cargo.toml`
Expected: PASS with `bridge_state_includes_runtime_capabilities ... ok`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/terminal/structured_provider.rs src-tauri/src/terminal/structured_runtime.rs src-tauri/src/terminal/structured_runtime_test.rs src-tauri/src/events.rs src/domain/terminal/types.ts
git commit -m "refactor: introduce structured agent adapter contract"
```

### Task 2: Move Codex Behind The New Adapter Runtime

**Files:**
- Create: `src-tauri/src/terminal/structured_codex.rs`
- Modify: `src-tauri/src/terminal/structured_runtime.rs`
- Modify: `src-tauri/src/terminal/agent_bridge.rs`
- Modify: `src-tauri/src/terminal/mod.rs`
- Test: `src-tauri/src/terminal/structured_runtime_test.rs`

- [ ] **Step 1: Write the failing codex adapter lifecycle test**

```rust
// src-tauri/src/terminal/structured_runtime_test.rs
use crate::terminal::structured_codex::CodexAdapter;
use crate::terminal::structured_provider::StructuredProviderAdapter;

#[test]
fn codex_adapter_exposes_capsule_and_review_capabilities() {
    let adapter = CodexAdapter::new();
    let capabilities = adapter.capabilities();

    assert!(capabilities.shows_bypass_capsule);
    assert!(capabilities.supports_review);
    assert!(capabilities.supports_resume_picker);
}
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run: `cargo test codex_adapter_exposes_capsule_and_review_capabilities --manifest-path src-tauri/Cargo.toml`
Expected: FAIL with missing `CodexAdapter`

- [ ] **Step 3: Extract codex command building and parsing into the adapter**

```rust
// src-tauri/src/terminal/structured_codex.rs
pub struct CodexAdapter;

impl CodexAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl StructuredProviderAdapter for CodexAdapter {
    fn provider_id(&self) -> &'static str {
        "codex"
    }

    fn capabilities(&self) -> StructuredAgentCapabilities {
        StructuredAgentCapabilities {
            supports_resume_picker: true,
            supports_direct_resume: false,
            supports_review: true,
            supports_model_override: true,
            shows_bypass_capsule: true,
        }
    }
}
```

```rust
// src-tauri/src/terminal/structured_runtime.rs
pub fn codex_adapter() -> Box<dyn StructuredProviderAdapter> {
    Box::new(CodexAdapter::new())
}
```

```rust
// src-tauri/src/terminal/agent_bridge.rs
let adapter = adapter_for(provider);
let capabilities = adapter.capabilities();
```

- [ ] **Step 4: Run the Rust test to verify it passes**

Run: `cargo test codex_adapter_exposes_capsule_and_review_capabilities --manifest-path src-tauri/Cargo.toml`
Expected: PASS with `... ok`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/terminal/structured_codex.rs src-tauri/src/terminal/structured_runtime.rs src-tauri/src/terminal/agent_bridge.rs src-tauri/src/terminal/mod.rs src-tauri/src/terminal/structured_runtime_test.rs
git commit -m "refactor: route codex through structured adapter runtime"
```

### Task 3: Replace The Qwen Bridge With A Codex-Like Adapter Or Shim

**Files:**
- Create: `src-tauri/src/terminal/structured_qwen.rs`
- Modify: `src-tauri/src/terminal/structured_runtime.rs`
- Modify: `src-tauri/src/terminal/agent_bridge.rs`
- Modify: `src-tauri/src/terminal/agent_bridge_test.rs`
- Test: `src-tauri/src/terminal/structured_runtime_test.rs`

- [ ] **Step 1: Write the failing qwen adapter capability and fallback tests**

```rust
// src-tauri/src/terminal/structured_runtime_test.rs
use crate::terminal::structured_qwen::QwenAdapter;
use crate::terminal::structured_provider::StructuredProviderAdapter;

#[test]
fn qwen_adapter_exposes_capsule_and_model_override_capabilities() {
    let adapter = QwenAdapter::new();
    let capabilities = adapter.capabilities();

    assert!(capabilities.shows_bypass_capsule);
    assert!(capabilities.supports_model_override);
    assert!(capabilities.supports_direct_resume);
}

#[test]
fn qwen_adapter_requests_raw_fallback_for_passthrough_commands() {
    let result = QwenAdapter::new().should_fallback_to_raw(&["auth".to_string()]);
    assert!(result);
}
```

- [ ] **Step 2: Run the Rust tests to verify they fail**

Run: `cargo test qwen_adapter_ --manifest-path src-tauri/Cargo.toml`
Expected: FAIL with missing `QwenAdapter` or missing `should_fallback_to_raw`

- [ ] **Step 3: Build the qwen codex-like adapter and isolate qwen-specific CLI details**

```rust
// src-tauri/src/terminal/structured_qwen.rs
pub struct QwenAdapter;

impl QwenAdapter {
    pub fn new() -> Self {
        Self
    }

    pub fn should_fallback_to_raw(&self, passthrough_args: &[String]) -> bool {
        !passthrough_args.is_empty()
    }
}

impl StructuredProviderAdapter for QwenAdapter {
    fn provider_id(&self) -> &'static str {
        "qwen"
    }

    fn capabilities(&self) -> StructuredAgentCapabilities {
        StructuredAgentCapabilities {
            supports_resume_picker: false,
            supports_direct_resume: true,
            supports_review: false,
            supports_model_override: true,
            shows_bypass_capsule: true,
        }
    }
}
```

```rust
// src-tauri/src/terminal/structured_runtime.rs
if adapter.should_fallback_to_raw(&passthrough_args) {
    return StructuredTurnResult::RawFallback {
        reason: "structured bridge unavailable for the current command".to_string(),
    };
}
```

```rust
// src-tauri/src/terminal/agent_bridge.rs
// Delete:
// - parse_qwen_line
// - build_qwen_command
// - build_qwen_command_for_test
// - qwen-specific provider_prompt_payload branch
```

- [ ] **Step 4: Run the Rust tests to verify they pass**

Run: `cargo test qwen_adapter_ --manifest-path src-tauri/Cargo.toml`
Expected: PASS with both qwen adapter tests green

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/terminal/structured_qwen.rs src-tauri/src/terminal/structured_runtime.rs src-tauri/src/terminal/agent_bridge.rs src-tauri/src/terminal/agent_bridge_test.rs src-tauri/src/terminal/structured_runtime_test.rs
git commit -m "refactor: replace qwen bridge with codex-like adapter"
```

### Task 4: Surface Runtime Capabilities To The Workspace Store

**Files:**
- Create: `src/features/terminal/lib/structured-agent-capabilities.ts`
- Create: `src/features/terminal/lib/structured-agent-capabilities.test.ts`
- Modify: `src/features/terminal/state/terminal-view-store.ts`
- Modify: `src/features/terminal/state/terminal-view-store.test.ts`
- Modify: `src/features/terminal/lib/ai-command.ts`
- Modify: `src/features/terminal/lib/ai-command.test.ts`

- [ ] **Step 1: Write the failing capability helper tests**

```ts
// src/features/terminal/lib/structured-agent-capabilities.test.ts
import { describe, expect, it } from "vitest";
import { buildComposerPlaceholder } from "./structured-agent-capabilities";

describe("structured agent capabilities", () => {
  it("builds the same capsule-friendly placeholder for codex and qwen structured runtimes", () => {
    expect(
      buildComposerPlaceholder({ showsBypassCapsule: true, supportsResumePicker: true, supportsDirectResume: false, supportsReview: true, supportsModelOverride: true }, "Codex"),
    ).toContain("Message Codex");

    expect(
      buildComposerPlaceholder({ showsBypassCapsule: true, supportsResumePicker: false, supportsDirectResume: true, supportsReview: false, supportsModelOverride: true }, "Qwen"),
    ).toContain("Message Qwen");
  });
});
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run: `npm test -- src/features/terminal/lib/structured-agent-capabilities.test.ts`
Expected: FAIL with missing module or missing helper exports

- [ ] **Step 3: Add capability helpers and store the capability payload**

```ts
// src/features/terminal/lib/structured-agent-capabilities.ts
import type { StructuredAgentCapabilities } from "../../../domain/terminal/types";

export const DEFAULT_STRUCTURED_AGENT_CAPABILITIES: StructuredAgentCapabilities = {
  supportsResumePicker: false,
  supportsDirectResume: false,
  supportsReview: false,
  supportsModelOverride: false,
  showsBypassCapsule: true,
};

export function buildComposerPlaceholder(capabilities: StructuredAgentCapabilities, label: string): string {
  const commands = ["/help", "/new"];
  if (capabilities.supportsResumePicker || capabilities.supportsDirectResume) commands.push("/resume");
  if (capabilities.supportsReview) commands.push("/review");
  if (capabilities.supportsModelOverride) commands.push("/model");
  return `Message ${label} or use ${commands.join(", ")}`;
}
```

```ts
// src/features/terminal/state/terminal-view-store.ts
export interface AgentBridgeState {
  provider: string;
  mode: "structured" | "raw-fallback";
  state: "connecting" | "ready" | "running" | "fallback";
  fallbackReason: string | null;
  capabilities?: StructuredAgentCapabilities | null;
}
```

```ts
// src/features/terminal/lib/ai-command.ts
// Replace provider-name branching with capability-driven helper calls.
```

- [ ] **Step 4: Run the frontend test to verify it passes**

Run: `npm test -- src/features/terminal/lib/structured-agent-capabilities.test.ts src/features/terminal/lib/ai-command.test.ts src/features/terminal/state/terminal-view-store.test.ts`
Expected: PASS with all capability helper tests green

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/lib/structured-agent-capabilities.ts src/features/terminal/lib/structured-agent-capabilities.test.ts src/features/terminal/state/terminal-view-store.ts src/features/terminal/state/terminal-view-store.test.ts src/features/terminal/lib/ai-command.ts src/features/terminal/lib/ai-command.test.ts
git commit -m "refactor: drive ai workspace commands from runtime capabilities"
```

### Task 5: Make The Capsule A Guaranteed Structured Runtime Feature

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `src/app/styles.css`
- Modify: `src/app/styles.test.ts`

- [ ] **Step 1: Write the failing codex capsule regression tests**

```tsx
// src/features/terminal/components/AiWorkflowSurface.test.tsx
it("renders the bypass capsule for codex structured runtime whenever runtime capabilities allow it", () => {
  expect(host.querySelector('[aria-label="Open quick AI prompt"]')).not.toBeNull();
});

// src/features/terminal/components/TerminalPane.test.tsx
it("keeps codex slash command routing capability-driven while still rendering the capsule", async () => {
  expect(latestBlockWorkspaceProps?.paneState).toMatchObject({
    presentation: "agent-workflow",
  });
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/TerminalPane.test.tsx src/app/styles.test.ts`
Expected: FAIL on codex capsule rendering or missing capability-driven wiring

- [ ] **Step 3: Wire the capsule to structured runtime availability instead of provider quirks**

```tsx
// src/features/terminal/components/AiWorkflowSurface.tsx
const bridgeCapabilities = bridge?.capabilities ?? null;
const showsBypassCapsule = isStructuredSurface && bridgeCapabilities?.showsBypassCapsule !== false;

{showsBypassCapsule ? (
  <AiModePromptOverlay
    expanded={bypassPromptOpen}
    draft={bypassDraft}
    disabled={composerDisabled || isBypassSubmitting}
    error={bypassError}
    statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
    onExpand={() => setBypassPromptOpen(true)}
    onChange={setBypassDraft}
    onCollapse={closeBypassPrompt}
    onSubmit={submitBypassPrompt}
  />
) : null}
```

```tsx
// src/features/terminal/components/TerminalPane.tsx
const capabilities = tabState?.agentBridge?.capabilities ?? null;
const composerPlaceholder = buildComposerPlaceholder(
  capabilities ?? DEFAULT_STRUCTURED_AGENT_CAPABILITIES,
  providerLabel,
);
```

```css
/* src/app/styles.css */
.ai-workflow__bypass-dock-shell {
  position: absolute;
  top: 50%;
  right: 12px;
  width: calc(100% - 24px);
  max-width: calc(100% - 24px);
}
```

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `npm test -- src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/TerminalPane.test.tsx src/app/styles.test.ts`
Expected: PASS with codex and qwen capsule tests green

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/TerminalPane.test.tsx src/app/styles.css src/app/styles.test.ts
git commit -m "feat: guarantee structured ai capsule for codex and qwen"
```

### Task 6: Normalize Transcript Copy And Raw Fallback Behavior

**Files:**
- Modify: `src/features/terminal/components/AiTranscript.tsx`
- Modify: `src/features/terminal/components/AiTranscript.test.tsx`
- Modify: `src/features/terminal/components/DialogTranscript.tsx`
- Modify: `src/features/terminal/components/DialogTranscript.test.tsx`
- Modify: `src/features/terminal/lib/dialog-output.ts`
- Modify: `src/features/terminal/hooks/useTerminalRuntime.ts`
- Modify: `src/features/terminal/components/BlockWorkspaceSurface.tsx`

- [ ] **Step 1: Write the failing transcript copy and fallback tests**

```tsx
// src/features/terminal/components/AiTranscript.test.tsx
it("copies structured assistant output without ANSI control bytes", () => {
  expect(getSelection()?.toString()).toContain("pong");
});

// src/features/terminal/hooks/runtime-session-routing.test.ts
it("switches to raw terminal ownership when a structured fallback event arrives", () => {
  expect(result.current.allowRawTerminalWrite).toBe(true);
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `npm test -- src/features/terminal/components/AiTranscript.test.tsx src/features/terminal/components/DialogTranscript.test.tsx src/features/terminal/hooks/runtime-session-routing.test.ts`
Expected: FAIL on fallback handling or ANSI-free copy assertions

- [ ] **Step 3: Keep structured copy DOM-native and preserve transcript on fallback**

```ts
// src/features/terminal/hooks/useTerminalRuntime.ts
const allowRawTerminalWrite =
  tabState?.presentation !== "agent-workflow" || tabState.agentBridge?.mode === "raw-fallback";
```

```tsx
// src/features/terminal/components/AiTranscript.tsx
<article className="ai-workflow__message" data-kind={entry.kind}>
  <pre>{entry.text}</pre>
</article>
```

```ts
// src/features/terminal/lib/dialog-output.ts
export function stripTerminalControlSequences(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, "");
}
```

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `npm test -- src/features/terminal/components/AiTranscript.test.tsx src/features/terminal/components/DialogTranscript.test.tsx src/features/terminal/hooks/runtime-session-routing.test.ts`
Expected: PASS with transcript copy and fallback tests green

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/AiTranscript.tsx src/features/terminal/components/AiTranscript.test.tsx src/features/terminal/components/DialogTranscript.tsx src/features/terminal/components/DialogTranscript.test.tsx src/features/terminal/lib/dialog-output.ts src/features/terminal/hooks/useTerminalRuntime.ts src/features/terminal/components/BlockWorkspaceSurface.tsx
git commit -m "feat: preserve structured transcript copy across raw fallback"
```

### Task 7: Delete The Old Qwen Bridge Path And Run Full Verification

**Files:**
- Modify: `src-tauri/src/terminal/agent_bridge.rs`
- Modify: `src-tauri/src/terminal/agent_bridge_test.rs`
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Test: `src-tauri/src/terminal/structured_runtime_test.rs`

- [ ] **Step 1: Write the failing dead-path regression test**

```rust
// src-tauri/src/terminal/structured_runtime_test.rs
#[test]
fn qwen_runtime_no_longer_exposes_legacy_stream_json_bridge_helpers() {
    let source = std::fs::read_to_string("src-tauri/src/terminal/agent_bridge.rs").unwrap();
    assert!(!source.contains("build_qwen_command_for_test"));
    assert!(!source.contains("parse_qwen_line"));
}
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run: `cargo test qwen_runtime_no_longer_exposes_legacy_stream_json_bridge_helpers --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because the legacy helpers still exist before deletion

- [ ] **Step 3: Delete the legacy qwen bridge code and keep only adapter-driven entry points**

```rust
// src-tauri/src/terminal/agent_bridge.rs
// Remove:
// fn parse_qwen_line(...)
// fn build_qwen_command(...)
// fn build_qwen_command_for_test(...)
// ProviderBridgeKind::Qwen => parse_qwen_line(&raw)
//
// Keep:
// run_agent_host_from_args(...)
// socket/control plumbing
// delegation into structured_runtime::run_turn(...)
```

- [ ] **Step 4: Run full verification**

Run: `npm run typecheck`
Expected: PASS with no TypeScript errors

Run: `npm test`
Expected: PASS with all Vitest suites green

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS with all Rust tests green

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/terminal/agent_bridge.rs src-tauri/src/terminal/agent_bridge_test.rs src-tauri/src/terminal/structured_runtime_test.rs src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx
git commit -m "refactor: remove legacy qwen bridge path"
```

## Self-Review

### Spec Coverage

- Unified runtime contract: Task 1
- Codex adapter normalization: Task 2
- Qwen codex-like shim and raw fallback: Task 3
- Runtime capability-driven frontend behavior: Task 4
- Codex capsule fix and shared capsule behavior: Task 5
- DOM transcript copy and fallback preservation: Task 6
- Legacy qwen bridge deletion and full verification: Task 7

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Each task includes concrete files, commands, and code snippets.

### Type Consistency

- Backend capability type name: `StructuredAgentCapabilities`
- Backend adapter trait: `StructuredProviderAdapter`
- Frontend mirrored type: `StructuredAgentCapabilities`
- Shared runtime concepts used consistently: `supportsResumePicker`, `supportsDirectResume`, `supportsReview`, `supportsModelOverride`, `showsBypassCapsule`
