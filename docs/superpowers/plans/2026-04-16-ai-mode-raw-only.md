# AI Mode Raw-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the structured AI runtime and make AI mode a raw-terminal-only workspace while keeping AI pane chrome and the bypass prompt capsule.

**Architecture:** Frontend AI panes keep the `AI MODE` shell, but always render a single raw terminal surface and route bypass input directly into that live terminal session. Backend provider wrappers keep semantic AI detection, but the structured bridge, provider adapters, and structured Tauri control commands are deleted so PTY ownership is the only execution truth.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri, Rust, portable-pty

---

## File Map

**Modify:**

- `src/features/terminal/components/AiWorkflowSurface.tsx`
- `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/features/terminal/components/TerminalPane.test.tsx`
- `src/features/terminal/components/BlockWorkspaceSurface.tsx`
- `src/features/terminal/components/BlockWorkspaceSurface.test.tsx`
- `src/features/terminal/components/AiModePromptOverlay.tsx`
- `src/features/terminal/lib/ai-prompt-transport.ts`
- `src/features/terminal/lib/ai-prompt-transport.test.ts`
- `src/features/terminal/state/terminal-view-store.ts`
- `src/features/terminal/state/terminal-view-store.test.ts`
- `src/domain/terminal/types.ts`
- `src/lib/tauri/terminal.ts`
- `src-tauri/src/commands/terminal.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/terminal/agent_bridge.rs`
- `src-tauri/src/terminal/mod.rs`

**Delete:**

- `src/features/terminal/components/StructuredAiPromptInput.tsx`
- `src/features/terminal/lib/ai-command.ts`
- `src/features/terminal/lib/ai-command.test.ts`
- `src/features/terminal/lib/structured-agent-capabilities.ts`
- `src/features/terminal/lib/structured-agent-capabilities.test.ts`
- `src-tauri/src/terminal/structured_codex.rs`
- `src-tauri/src/terminal/structured_provider.rs`
- `src-tauri/src/terminal/structured_qwen.rs`
- `src-tauri/src/terminal/structured_runtime.rs`
- `src-tauri/src/terminal/structured_runtime_test.rs`

**Keep under review while implementing:**

- `src/features/terminal/hooks/useTerminalRuntime.ts`
- `src-tauri/src/terminal/shell_integration.rs`
- `src-tauri/src/terminal/semantic.rs`

---

### Task 1: Collapse AI Mode Rendering To One Raw Terminal Surface

**Files:**
- Modify: `src/features/terminal/components/AiWorkflowSurface.tsx`
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `src/features/terminal/components/BlockWorkspaceSurface.test.tsx`
- Delete: `src/features/terminal/components/StructuredAiPromptInput.tsx`

- [ ] **Step 1: Write the failing AI workflow surface tests for raw-only rendering**

Add focused tests proving AI mode no longer renders a structured transcript/composer branch and always renders the raw terminal surface with the capsule.

```tsx
it("renders the raw terminal surface as the primary AI workspace for codex", () => {
  render(
    <AiWorkflowSurface
      tabId="tab:1"
      paneState={createAiPaneState({ provider: "codex" })}
      status="running"
      sessionId="session-1"
      fontFamily="monospace"
      fontSize={14}
      theme={theme}
      isActive={true}
      write={vi.fn(async () => undefined)}
      resize={vi.fn(async () => undefined)}
      onSubmitAiInput={vi.fn(async () => undefined)}
      quickPromptOpenRequestKey={0}
    />,
  );

  expect(screen.getByLabelText("AI workflow terminal")).toBeInTheDocument();
  expect(screen.queryByText("Open Expert Drawer")).toBeNull();
  expect(screen.queryByLabelText("AI composer input")).toBeNull();
});

it("keeps the bypass capsule available in AI mode without a structured transcript", () => {
  render(/* same setup */);

  expect(screen.getByRole("button", { name: "Open quick AI prompt" })).toBeInTheDocument();
  expect(screen.queryByText("workspace chat")).toBeNull();
});
```

- [ ] **Step 2: Run the AI workflow surface tests to verify they fail**

Run: `npm test -- --run src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/BlockWorkspaceSurface.test.tsx`

Expected: FAIL because the current component still renders structured transcript UI, expert drawer controls, and the structured composer branch.

- [ ] **Step 3: Replace the structured AI surface with one raw terminal workspace**

Refactor `AiWorkflowSurface` so it renders:

- the bypass capsule
- one raw terminal surface
- no structured transcript UI
- no expert drawer
- no structured composer footer

Implementation shape:

```tsx
export function AiWorkflowSurface(props: AiWorkflowSurfaceProps) {
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);

  const submitBypassPrompt = async () => {
    const normalized = bypassDraft.trim();
    if (!normalized || props.status !== "running" || isBypassSubmitting) {
      return;
    }

    setIsBypassSubmitting(true);
    setBypassError(null);
    try {
      await props.onSubmitAiInput(normalized);
      setBypassDraft("");
      setBypassPromptOpen(false);
    } catch {
      setBypassError("Could not send prompt. The draft was kept so you can retry.");
    } finally {
      setIsBypassSubmitting(false);
    }
  };

  return (
    <div className="ai-workflow">
      <AiModePromptOverlay
        expanded={bypassPromptOpen}
        draft={bypassDraft}
        disabled={props.status !== "running" || isBypassSubmitting}
        error={bypassError}
        statusMessage={props.status !== "running" ? "The AI session is not accepting input." : null}
        onChange={(value) => {
          setBypassDraft(value);
          setBypassError(null);
        }}
        onCollapse={() => {
          if (bypassDraft.trim().length === 0) {
            setBypassPromptOpen(false);
            setBypassError(null);
          }
        }}
        onSubmit={submitBypassPrompt}
      />

      <div className="ai-workflow__terminal-shell">
        <ClassicTerminalSurface
          tabId={props.tabId}
          sessionId={props.sessionId}
          fontFamily={props.fontFamily}
          fontSize={props.fontSize}
          theme={props.theme}
          isActive={props.isActive}
          inputSuspended={false}
          write={props.write}
          resize={props.resize}
          ariaLabel="AI workflow terminal"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Remove the now-dead structured input component file**

Delete `src/features/terminal/components/StructuredAiPromptInput.tsx`.

No replacement file is needed because the bypass capsule will use a plain textarea shape instead of the structured command-aware input component.

- [ ] **Step 5: Run the AI workflow surface tests to verify they pass**

Run: `npm test -- --run src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/BlockWorkspaceSurface.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the UI surface collapse**

```bash
git add src/features/terminal/components/AiWorkflowSurface.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/BlockWorkspaceSurface.test.tsx src/features/terminal/components/StructuredAiPromptInput.tsx
git commit -m "refactor: make ai workflow surface raw terminal only"
```

---

### Task 2: Remove Structured Prompt Submission And Capability Branching From The Frontend

**Files:**
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `src/features/terminal/components/AiModePromptOverlay.tsx`
- Modify: `src/features/terminal/lib/ai-prompt-transport.ts`
- Modify: `src/features/terminal/lib/ai-prompt-transport.test.ts`
- Delete: `src/features/terminal/lib/ai-command.ts`
- Delete: `src/features/terminal/lib/ai-command.test.ts`
- Delete: `src/features/terminal/lib/structured-agent-capabilities.ts`
- Delete: `src/features/terminal/lib/structured-agent-capabilities.test.ts`

- [ ] **Step 1: Write the failing TerminalPane tests for raw-only AI prompt routing**

Replace structured-command assertions with tests that prove both the capsule and any AI-mode prompt entry go straight to terminal transport.

```tsx
it("routes ai mode prompt submissions directly to terminal transport", async () => {
  renderTerminalPane({
    tabState: createAiPaneState(),
    currentStreamSessionId: "session-1",
  });

  await act(async () => {
    await latestBlockWorkspaceProps?.onSubmitAiInput("ping");
  });

  expect(write).toHaveBeenCalledWith("ping\r");
  expect(terminalApi.submitTerminalAgentPrompt).not.toHaveBeenCalled();
});

it("does not expose structured codex session helpers in ai mode", () => {
  renderTerminalPane({ tabState: createAiPaneState() });

  expect(screen.queryByText(/Resume Codex session/u)).toBeNull();
  expect(screen.queryByText(/Expert Drawer/u)).toBeNull();
});
```

- [ ] **Step 2: Run the TerminalPane and prompt transport tests to verify they fail**

Run: `npm test -- --run src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/lib/ai-prompt-transport.test.ts`

Expected: FAIL because `TerminalPane` still imports structured commands, structured capabilities, and `submitTerminalAgentPrompt`.

- [ ] **Step 3: Remove structured command parsing from `TerminalPane`**

Refactor `TerminalPane` so AI mode only does two things:

- records a local AI prompt marker if that transcript is still retained for UX
- sends text into `sendAiPrompt` with only terminal transport

Implementation shape:

```tsx
const submitAiPrompt = async (prompt: string) => {
  recordAiPrompt(tabId, prompt);
  await sendAiPrompt({
    tabId,
    prompt,
    writeFallback: write,
  });
};

const handleAiComposerInput = async (input: string) => {
  await submitAiPrompt(input);
};
```

Delete:

- structured slash command parsing
- resume picker state
- model override handling
- review helper handling
- expert drawer request state

- [ ] **Step 4: Simplify `AiModePromptOverlay` and `ai-prompt-transport` to raw terminal semantics**

Update the capsule props so they no longer depend on structured command capabilities.

Implementation shape:

```tsx
interface AiModePromptOverlayProps {
  expanded: boolean;
  draft: string;
  disabled: boolean;
  error: string | null;
  statusMessage?: string | null;
  onChange: (value: string) => void;
  onCollapse: () => void;
  onSubmit: () => void | Promise<void>;
}
```

And simplify `sendAiPrompt`:

```ts
export async function sendAiPrompt({
  tabId,
  prompt,
  writeFallback,
}: {
  tabId: string;
  prompt: string;
  writeFallback: (data: string) => Promise<void>;
}): Promise<void> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return;
  }

  const controller = getTerminal(tabId);
  if (controller) {
    controller.pasteText(normalizedPrompt);
    await controller.sendEnter();
    return;
  }

  await writeFallback(normalizedPrompt.replace(/\r?\n/gu, "\r"));
  await writeFallback("\r");
}
```

- [ ] **Step 5: Delete the structured capability helper modules**

Delete:

- `src/features/terminal/lib/ai-command.ts`
- `src/features/terminal/lib/ai-command.test.ts`
- `src/features/terminal/lib/structured-agent-capabilities.ts`
- `src/features/terminal/lib/structured-agent-capabilities.test.ts`

Also remove their imports from:

- `src/features/terminal/components/AiWorkflowSurface.tsx`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/features/terminal/components/AiModePromptOverlay.tsx`

- [ ] **Step 6: Run the frontend raw-only prompt tests to verify they pass**

Run: `npm test -- --run src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/lib/ai-prompt-transport.test.ts src/features/terminal/components/AiWorkflowSurface.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit the frontend transport cleanup**

```bash
git add src/features/terminal/components/TerminalPane.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiModePromptOverlay.tsx src/features/terminal/lib/ai-prompt-transport.ts src/features/terminal/lib/ai-prompt-transport.test.ts src/features/terminal/lib/ai-command.ts src/features/terminal/lib/ai-command.test.ts src/features/terminal/lib/structured-agent-capabilities.ts src/features/terminal/lib/structured-agent-capabilities.test.ts
git commit -m "refactor: remove structured ai prompt flow"
```

---

### Task 3: Simplify Terminal View State To Presentation-Only AI Metadata

**Files:**
- Modify: `src/features/terminal/state/terminal-view-store.ts`
- Modify: `src/features/terminal/state/terminal-view-store.test.ts`
- Modify: `src/domain/terminal/types.ts`

- [ ] **Step 1: Write the failing store tests for presentation-only AI mode state**

Replace agent-bridge-specific expectations with tests that keep only provider presentation metadata and raw-terminal prompt recording.

```ts
it("marks ai workflows with provider metadata without bridge mode state", () => {
  const store = useTerminalViewStore.getState();

  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.consumeSemantic("tab:1", {
    sessionId: "session-1",
    kind: "agent-workflow",
    reason: "shell-entry",
    confidence: "strong",
    commandEntry: "codex",
  });

  const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
  expect(tabState?.presentation).toBe("agent-workflow");
  expect(tabState?.aiSession?.provider).toBe("codex");
  expect(tabState?.aiSession?.rawOnly).toBe(true);
});

it("does not depend on terminal agent bridge events to keep ai mode active", () => {
  const store = useTerminalViewStore.getState();
  store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
  store.consumeSemantic("tab:1", { /* same event */ });

  const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
  expect(tabState?.presentation).toBe("agent-workflow");
  expect(tabState?.agentBridge).toBeUndefined();
});
```

- [ ] **Step 2: Run the terminal view store tests to verify they fail**

Run: `npm test -- --run src/features/terminal/state/terminal-view-store.test.ts`

Expected: FAIL because the current store still declares `TerminalAgentEvent`, `AgentBridgeState`, and structured capability state.

- [ ] **Step 3: Remove structured agent bridge state and events from the store**

Simplify the store shape so AI mode tracks only minimal presentation metadata.

Implementation shape:

```ts
export interface AiSessionState {
  provider: "codex" | "claude" | "qwen" | "unknown";
  rawOnly: true;
}

export interface TerminalTabViewState extends DialogState {
  shell: string;
  workspaceCwd?: string;
  parserState: ShellIntegrationParserState;
  aiTranscript?: AiTranscriptState;
  aiSession?: AiSessionState | null;
  transcriptViewport?: TranscriptViewportState;
}
```

And in `consumeSemantic`:

```ts
if (event.kind === "agent-workflow") {
  nextState = {
    ...nextState,
    aiSession: {
      provider: resolveAgentProvider(event.commandEntry) ?? "unknown",
      rawOnly: true,
    },
  };
}
```

Delete:

- `consumeAgentEvent`
- `TerminalAgentEvent` handling
- `AgentBridgeState`
- structured capability imports

- [ ] **Step 4: Remove structured terminal agent event types from the shared domain**

Update `src/domain/terminal/types.ts` by deleting:

- `TERMINAL_AGENT_EVENT`
- `TerminalAgentMode`
- `TerminalAgentState`
- `StructuredAgentCapabilities`
- `TerminalAgentEvent`

Keep:

- session creation types
- terminal output and exit types
- semantic detection event types

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `npm test -- --run src/features/terminal/state/terminal-view-store.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the state-model simplification**

```bash
git add src/features/terminal/state/terminal-view-store.ts src/features/terminal/state/terminal-view-store.test.ts src/domain/terminal/types.ts
git commit -m "refactor: simplify ai mode state to raw-only metadata"
```

---

### Task 4: Delete The Structured Tauri Bridge And Raw-Fallback Split

**Files:**
- Modify: `src/lib/tauri/terminal.ts`
- Modify: `src-tauri/src/commands/terminal.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/terminal/agent_bridge.rs`
- Modify: `src-tauri/src/terminal/mod.rs`
- Delete: `src-tauri/src/terminal/structured_codex.rs`
- Delete: `src-tauri/src/terminal/structured_provider.rs`
- Delete: `src-tauri/src/terminal/structured_qwen.rs`
- Delete: `src-tauri/src/terminal/structured_runtime.rs`
- Delete: `src-tauri/src/terminal/structured_runtime_test.rs`

- [ ] **Step 1: Write the failing backend-facing tests for raw-only provider launch**

Add or update Rust tests to prove that the agent host no longer exposes structured bridge lifecycle and simply executes providers directly.

```rust
#[test]
fn agent_host_runs_providers_without_structured_fallback_branching() {
    let args = vec![
        "--praw-agent-host".to_string(),
        "codex".to_string(),
        "--session-id".to_string(),
        "session-1".to_string(),
        "--cwd".to_string(),
        "/workspace".to_string(),
        "--".to_string(),
        "--dangerously-bypass-approvals-and-sandbox".to_string(),
    ];

    let source = std::fs::read_to_string("src/terminal/agent_bridge.rs").unwrap();
    assert!(!source.contains("structured bridge unavailable"));
    assert!(!source.contains("run_structured_agent_host"));
    assert!(!source.contains("AgentControlMessage"));
}
```

- [ ] **Step 2: Run the Rust terminal tests to verify they fail**

Run: `cargo test terminal:: --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because the current backend still exports structured runtime modules and bridge control code.

- [ ] **Step 3: Remove structured frontend RPCs**

Delete the structured commands from:

- `src/lib/tauri/terminal.ts`
- `src-tauri/src/commands/terminal.rs`
- `src-tauri/src/lib.rs`

Remove:

```ts
submitTerminalAgentPrompt
resetTerminalAgentSession
attachTerminalAgentSession
setTerminalAgentModel
listCodexSessions
runTerminalAgentReview
onTerminalAgent
```

And the corresponding Rust commands:

```rust
submit_terminal_agent_prompt
reset_terminal_agent_session
attach_terminal_agent_session
set_terminal_agent_model
list_codex_sessions
run_terminal_agent_review
```

- [ ] **Step 4: Replace `agent_bridge.rs` with a raw-only launcher helper**

Keep only the provider wrapper entry that maps CLI names and execs them directly in the PTY process.

Implementation shape:

```rust
pub const PRAW_APP_BIN_ENV: &str = "PRAW_APP_BIN";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderBridgeKind {
    Codex,
    Claude,
    Qwen,
}

impl ProviderBridgeKind {
    pub fn from_cli_name(value: &str) -> Option<Self> { /* same mapping */ }
    pub fn as_str(self) -> &'static str { /* same mapping */ }
}

pub fn run_agent_host_from_args(args: &[String]) -> Result<bool> {
    if args.first().map(String::as_str) != Some("--praw-agent-host") {
        return Ok(false);
    }

    let provider = /* parse provider */;
    let cwd = value_after(args, "--cwd").context("missing --cwd for --praw-agent-host")?;
    let passthrough_args = trailing_args(args);

    exec_raw_provider(provider, Path::new(cwd), &passthrough_args)?;
    Ok(true)
}
```

Delete:

- socket server creation
- bridge-state event emission
- structured control messages
- session attach/reset/model logic
- normalized assistant-message parsing

- [ ] **Step 5: Delete the structured runtime modules**

Delete:

- `src-tauri/src/terminal/structured_codex.rs`
- `src-tauri/src/terminal/structured_provider.rs`
- `src-tauri/src/terminal/structured_qwen.rs`
- `src-tauri/src/terminal/structured_runtime.rs`
- `src-tauri/src/terminal/structured_runtime_test.rs`

Then update `src-tauri/src/terminal/mod.rs` so it no longer references or re-exports them.

- [ ] **Step 6: Run the Rust tests to verify the backend cleanup passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 7: Commit the Tauri raw-only runtime cleanup**

```bash
git add src/lib/tauri/terminal.ts src-tauri/src/commands/terminal.rs src-tauri/src/lib.rs src-tauri/src/terminal/agent_bridge.rs src-tauri/src/terminal/mod.rs src-tauri/src/terminal/structured_codex.rs src-tauri/src/terminal/structured_provider.rs src-tauri/src/terminal/structured_qwen.rs src-tauri/src/terminal/structured_runtime.rs src-tauri/src/terminal/structured_runtime_test.rs
git commit -m "refactor: remove structured ai bridge runtime"
```

---

### Task 5: Final Cleanup, AI-Mode Regression Coverage, And Verification

**Files:**
- Modify: `src/features/terminal/components/TerminalPane.test.tsx`
- Modify: `src/features/terminal/components/AiWorkflowSurface.test.tsx`
- Modify: `src/features/terminal/state/terminal-view-store.test.ts`
- Modify: `src/features/terminal/lib/ai-prompt-transport.test.ts`
- Modify: `src/features/terminal/components/BlockWorkspaceSurface.tsx`
- Modify: `src/features/terminal/components/BlockWorkspaceSurface.test.tsx`

- [ ] **Step 1: Add a regression test for the approved raw-only AI-mode shape**

Keep one high-signal test that matches the approved UX:

```tsx
it("keeps ai mode chrome while using the raw terminal as the only visible workspace", () => {
  renderTerminalPane({
    tabState: createAiPaneState({ provider: "codex" }),
  });

  expect(screen.getByLabelText("AI workflow mode")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open quick AI prompt" })).toBeInTheDocument();
  expect(screen.getByLabelText("AI workflow terminal")).toBeInTheDocument();
  expect(screen.queryByText("Resume Codex session")).toBeNull();
  expect(screen.queryByText("Open Expert Drawer")).toBeNull();
});
```

- [ ] **Step 2: Run the targeted frontend regression suite**

Run: `npm test -- --run src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/BlockWorkspaceSurface.test.tsx src/features/terminal/state/terminal-view-store.test.ts src/features/terminal/lib/ai-prompt-transport.test.ts`

Expected: PASS

- [ ] **Step 3: Run the terminal archive regression suite to ensure raw-only AI mode did not re-break terminal history**

Run: `npm test -- --run src/features/terminal/components/XtermTerminalSurface.test.tsx src/domain/terminal/dialog.test.ts src/features/terminal/state/terminal-view-store.test.ts`

Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: Run the Rust test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit the regression coverage and cleanup**

```bash
git add src/features/terminal/components/TerminalPane.test.tsx src/features/terminal/components/AiWorkflowSurface.test.tsx src/features/terminal/components/BlockWorkspaceSurface.tsx src/features/terminal/components/BlockWorkspaceSurface.test.tsx src/features/terminal/state/terminal-view-store.test.ts src/features/terminal/lib/ai-prompt-transport.test.ts
git commit -m "test: cover raw-only ai mode runtime"
```

---

## Self-Review

### Spec coverage

- Keep AI mode chrome while removing structured runtime: covered by Tasks 1, 2, and 5.
- Make the raw terminal the only execution truth: covered by Tasks 1, 3, 4, and 5.
- Keep the bypass capsule as a side input: covered by Tasks 1 and 2.
- Return `/resume`, `/model`, and `/review` to native CLI ownership: covered by Tasks 2 and 4.
- Remove structured bridge/backend code: covered by Task 4.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Each implementation task names the exact files and verification commands it touches.

### Type consistency

- The plan consistently replaces `agentBridge` with `aiSession` and removes `TerminalAgentEvent`.
- Raw-only submission consistently flows through `sendAiPrompt` and the live terminal transport.
