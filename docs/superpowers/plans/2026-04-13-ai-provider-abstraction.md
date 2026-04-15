# AI Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current GLM-only AI wiring with a real multi-provider abstraction that supports `openai`, `anthropic`, `gemini`, `xai`, `glm`, `deepseek`, `qwen`, and `doubao` without scattering provider-specific logic through the frontend and backend.

**Architecture:** The frontend moves from provider-name checks to provider metadata and capability gating. The Rust backend is split into shared types, a provider trait, a registry, and provider modules, with OpenAI-compatible vendors sharing one transport helper while Anthropic and Gemini keep dedicated implementations.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri 2, Rust, reqwest, serde

---

## File Map

### Frontend files to modify

- `src/domain/ai/catalog.ts`
- `src/domain/ai/types.ts`
- `src/domain/config/types.ts`
- `src/domain/config/model.ts`
- `src/domain/config/model.test.ts`
- `src/features/config/components/SettingsPanel.tsx`
- `src/features/config/lib/ai-connection.test.ts`
- `src/features/config/state/app-config-store.test.ts`
- `src/features/terminal/lib/ghost-completion.ts`
- `src/features/terminal/lib/ghost-completion.test.ts`
- `src/features/terminal/lib/suggestion-engine.ts`
- `src/features/terminal/lib/suggestion-engine.test.ts`
- `src/lib/tauri/ai.ts`

### Rust files to create

- `src-tauri/src/ai/types.rs`
- `src-tauri/src/ai/provider.rs`
- `src-tauri/src/ai/registry.rs`
- `src-tauri/src/ai/providers/mod.rs`
- `src-tauri/src/ai/providers/openai_compatible.rs`
- `src-tauri/src/ai/providers/glm.rs`
- `src-tauri/src/ai/providers/openai.rs`
- `src-tauri/src/ai/providers/xai.rs`
- `src-tauri/src/ai/providers/deepseek.rs`
- `src-tauri/src/ai/providers/qwen.rs`
- `src-tauri/src/ai/providers/doubao.rs`
- `src-tauri/src/ai/providers/anthropic.rs`
- `src-tauri/src/ai/providers/gemini.rs`

### Rust files to modify

- `src-tauri/src/ai/mod.rs`
- `src-tauri/src/commands/ai.rs`
- `src-tauri/src/config/mod.rs`

### Verification commands used throughout

- Frontend targeted test: `npm test -- <path-to-test-file>`
- Frontend full type check: `npm run typecheck`
- Rust targeted test: `cargo test --manifest-path src-tauri/Cargo.toml <test_name>`
- Rust full test suite: `cargo test --manifest-path src-tauri/Cargo.toml`

### Task 1: Build the frontend provider catalog and capability model

**Files:**
- Modify: `src/domain/ai/catalog.ts`
- Modify: `src/domain/ai/types.ts`
- Test: `src/domain/config/model.test.ts`

- [ ] **Step 1: Write the failing type and catalog assertions**

```ts
import { AI_PROVIDER_OPTIONS, getAiProviderOption } from "../ai/catalog";
import type { CompletionProvider, AiCapability } from "../ai/types";

it("exposes all first-wave providers in the catalog", () => {
  expect(AI_PROVIDER_OPTIONS.map((option) => option.id)).toEqual([
    "openai",
    "anthropic",
    "gemini",
    "xai",
    "glm",
    "deepseek",
    "qwen",
    "doubao",
  ] satisfies CompletionProvider[]);
});

it("marks completion and connection-test capabilities explicitly", () => {
  const glm = getAiProviderOption("glm");
  expect(glm?.capabilities).toContain("completion" satisfies AiCapability);
  expect(glm?.capabilities).toContain("connectionTest" satisfies AiCapability);
});
```

- [ ] **Step 2: Run the targeted test to verify the catalog is still GLM-only**

Run: `npm test -- src/domain/config/model.test.ts`
Expected: FAIL because `AI_PROVIDER_OPTIONS` does not expose `id`/`capabilities`, and `CompletionProvider` is still `"glm"` only.

- [ ] **Step 3: Implement the provider metadata model**

```ts
export type CompletionProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "xai"
  | "glm"
  | "deepseek"
  | "qwen"
  | "doubao";

export type AiCapability =
  | "completion"
  | "inlineSuggestion"
  | "recoverySuggestion"
  | "connectionTest";

export interface AiProviderOption {
  id: CompletionProvider;
  label: string;
  family: "openai-compatible" | "anthropic" | "gemini";
  capabilities: AiCapability[];
  defaultBaseUrl: string;
  defaultModelHints: string[];
  authStrategy: "bearer";
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { id: "openai", label: "OpenAI", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://api.openai.com/v1", defaultModelHints: ["gpt-4.1-mini"], authStrategy: "bearer" },
  { id: "anthropic", label: "Anthropic", family: "anthropic", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://api.anthropic.com/v1", defaultModelHints: ["claude-3-5-sonnet-latest"], authStrategy: "bearer" },
  { id: "gemini", label: "Gemini", family: "gemini", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModelHints: ["gemini-2.0-flash"], authStrategy: "bearer" },
  { id: "xai", label: "xAI", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://api.x.ai/v1", defaultModelHints: ["grok-2-latest"], authStrategy: "bearer" },
  { id: "glm", label: "GLM", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModelHints: ["glm-4.5-flash"], authStrategy: "bearer" },
  { id: "deepseek", label: "DeepSeek", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://api.deepseek.com/v1", defaultModelHints: ["deepseek-chat"], authStrategy: "bearer" },
  { id: "qwen", label: "Qwen", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModelHints: ["qwen-plus"], authStrategy: "bearer" },
  { id: "doubao", label: "Doubao", family: "openai-compatible", capabilities: ALL_CAPABILITIES, defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModelHints: ["doubao-seed-1-6"], authStrategy: "bearer" },
];

export function getAiProviderOption(provider: string): AiProviderOption | null {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? null;
}
```

- [ ] **Step 4: Re-run the targeted test and typecheck**

Run: `npm test -- src/domain/config/model.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS, or only unrelated pre-existing failures outside AI provider typing.

- [ ] **Step 5: Commit the isolated frontend catalog change**

```bash
git add src/domain/ai/catalog.ts src/domain/ai/types.ts src/domain/config/model.test.ts
git commit -m "feat: add ai provider catalog metadata"
```

### Task 2: Extend AI config with `baseUrl` and normalize legacy values

**Files:**
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write failing config normalization tests for `baseUrl`**

```ts
it("preserves an explicitly configured ai base url", () => {
  expect(
    resolveAppConfig({
      ai: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: " https://proxy.example.com/v1 ",
      } as never,
    }).ai.baseUrl,
  ).toBe("https://proxy.example.com/v1");
});

it("keeps baseUrl empty when not configured", () => {
  expect(resolveAppConfig({ ai: { provider: "glm" } }).ai.baseUrl).toBe("");
});
```

- [ ] **Step 2: Run the config tests to verify `baseUrl` is missing**

Run: `npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`
Expected: FAIL because `AiConfig` does not contain `baseUrl`.

- [ ] **Step 3: Implement `baseUrl` in the config model**

```ts
export interface AiConfig {
  provider: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  smartSuggestionBubble: boolean;
  apiKey: string;
  themeColor: string;
  backgroundColor: string;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  ai: {
    provider: "",
    model: "",
    baseUrl: "",
    enabled: false,
    smartSuggestionBubble: true,
    apiKey: "",
    themeColor: "#1f5eff",
    backgroundColor: "#eef4ff",
  },
};

return {
  ai: {
    provider: normalizeAiIdentifier(ai?.provider),
    model: normalizeAiIdentifier(ai?.model),
    baseUrl: normalizeOptionalString(ai?.baseUrl),
    enabled: typeof ai?.enabled === "boolean" ? ai.enabled : DEFAULT_APP_CONFIG.ai.enabled,
    smartSuggestionBubble:
      typeof ai?.smartSuggestionBubble === "boolean"
        ? ai.smartSuggestionBubble
        : DEFAULT_APP_CONFIG.ai.smartSuggestionBubble,
    apiKey: normalizeOptionalString(ai?.apiKey),
    themeColor: normalizeHexColor(ai?.themeColor, DEFAULT_APP_CONFIG.ai.themeColor),
    backgroundColor: normalizeHexColor(ai?.backgroundColor, DEFAULT_APP_CONFIG.ai.backgroundColor),
  },
};
```

- [ ] **Step 4: Re-run config tests**

Run: `npm test -- src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the config-model migration**

```bash
git add src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "feat: add ai base url config"
```

### Task 3: Remove frontend `glm` special cases from ghost and suggestion request gating

**Files:**
- Modify: `src/features/terminal/lib/ghost-completion.ts`
- Modify: `src/features/terminal/lib/suggestion-engine.ts`
- Test: `src/features/terminal/lib/ghost-completion.test.ts`
- Test: `src/features/terminal/lib/suggestion-engine.test.ts`
- Modify: `src/domain/ai/catalog.ts`

- [ ] **Step 1: Write failing non-GLM request-gating tests**

```ts
it("allows OpenAI ghost completion when provider config is complete", () => {
  expect(
    shouldRequestGhostCompletion({
      ...baseContext,
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "secret",
    }),
  ).toBe(true);
});

it("allows Qwen recovery suggestions through generic capability checks", () => {
  expect(
    shouldRequestRecoverySuggestions(
      {
        ...baseContext,
        provider: "qwen",
        model: "qwen-plus",
        apiKey: "secret",
      },
      failedBlock,
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run the targeted suggestion tests**

Run: `npm test -- src/features/terminal/lib/ghost-completion.test.ts src/features/terminal/lib/suggestion-engine.test.ts`
Expected: FAIL because both helpers reject any provider other than `glm`.

- [ ] **Step 3: Implement capability-based gating helpers**

```ts
import { getAiProviderOption } from "../../../domain/ai/catalog";

function canUseCapability(
  provider: string,
  capability: "completion" | "inlineSuggestion" | "recoverySuggestion",
): boolean {
  const option = getAiProviderOption(provider);
  return option?.capabilities.includes(capability) ?? false;
}

if (!context.aiEnabled || context.apiKey.length === 0 || context.model.trim().length === 0) {
  return false;
}

if (!canUseCapability(context.provider, "completion")) {
  return false;
}
```

```ts
if (!canUseCapability(context.provider, "inlineSuggestion")) {
  return false;
}

if (!canUseCapability(context.provider, "recoverySuggestion")) {
  return false;
}
```

- [ ] **Step 4: Re-run the AI suggestion tests and typecheck**

Run: `npm test -- src/features/terminal/lib/ghost-completion.test.ts src/features/terminal/lib/suggestion-engine.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS, or only unrelated pre-existing failures outside AI modules.

- [ ] **Step 5: Commit the generic request gating**

```bash
git add src/features/terminal/lib/ghost-completion.ts src/features/terminal/lib/ghost-completion.test.ts src/features/terminal/lib/suggestion-engine.ts src/features/terminal/lib/suggestion-engine.test.ts src/domain/ai/catalog.ts
git commit -m "refactor: gate ai suggestions by provider capabilities"
```

### Task 4: Generalize the settings panel to all providers and `baseUrl`

**Files:**
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/lib/tauri/ai.ts`
- Modify: `src/domain/ai/types.ts`
- Modify: `src/features/config/lib/settings-panel-copy.ts`
- Test: `src/features/config/lib/ai-connection.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write failing settings and connection tests**

```ts
it("sends baseUrl in AI connection tests", async () => {
  const request: AiConnectionTestRequest = {
    provider: "openai",
    model: "gpt-4.1-mini",
    apiKey: "secret",
    baseUrl: "https://proxy.example.com/v1",
  };

  expect(request.baseUrl).toBe("https://proxy.example.com/v1");
});
```

```tsx
const canTestConnection =
  config.ai.provider.length > 0 &&
  config.ai.model.trim().length > 0 &&
  config.ai.apiKey.trim().length > 0;
```

- [ ] **Step 2: Run targeted frontend tests**

Run: `npm test -- src/features/config/lib/ai-connection.test.ts src/features/config/state/app-config-store.test.ts`
Expected: FAIL because `AiConnectionTestRequest` and settings persistence do not include `baseUrl`.

- [ ] **Step 3: Implement provider-aware settings UI**

```tsx
const selectedProvider = getAiProviderOption(config.ai.provider);

const effectiveBaseUrl =
  config.ai.baseUrl.trim().length > 0
    ? config.ai.baseUrl
    : selectedProvider?.defaultBaseUrl ?? "";

<select
  value={config.ai.provider}
  onChange={(event) => {
    const nextProvider = event.target.value as CompletionProvider | "";
    const option = getAiProviderOption(nextProvider);
    patchAi({
      provider: nextProvider,
      model: option?.defaultModelHints[0] ?? "",
      baseUrl: option?.defaultBaseUrl ?? "",
    });
  }}
>
  <option value="">{copy.ai.providerPlaceholder}</option>
  {AI_PROVIDER_OPTIONS.map((option) => (
    <option key={option.id} value={option.id}>
      {option.label}
    </option>
  ))}
</select>

<label className="settings-field">
  <span>{copy.ai.baseUrl}</span>
  <input
    value={config.ai.baseUrl}
    placeholder={selectedProvider?.defaultBaseUrl ?? ""}
    onChange={(event) => patchAi({ baseUrl: event.target.value })}
  />
</label>
```

```ts
export interface AiConnectionTestRequest {
  provider: CompletionProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
}
```

- [ ] **Step 4: Re-run targeted frontend tests and typecheck**

Run: `npm test -- src/features/config/lib/ai-connection.test.ts src/features/config/state/app-config-store.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS, or only unrelated pre-existing failures outside AI modules.

- [ ] **Step 5: Commit the settings-panel provider generalization**

```bash
git add src/features/config/components/SettingsPanel.tsx src/lib/tauri/ai.ts src/domain/ai/types.ts src/features/config/lib/settings-panel-copy.ts src/features/config/lib/ai-connection.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "feat: generalize ai settings panel for multi-provider config"
```

### Task 5: Split Rust AI core into shared types, provider trait, and registry with GLM-only parity

**Files:**
- Create: `src-tauri/src/ai/types.rs`
- Create: `src-tauri/src/ai/provider.rs`
- Create: `src-tauri/src/ai/registry.rs`
- Create: `src-tauri/src/ai/providers/mod.rs`
- Create: `src-tauri/src/ai/providers/glm.rs`
- Modify: `src-tauri/src/ai/mod.rs`
- Test: `src-tauri/src/ai/registry.rs`
- Test: `src-tauri/src/ai/providers/glm.rs`

- [ ] **Step 1: Write failing Rust registry tests**

```rust
#[cfg(test)]
mod tests {
    use super::ProviderRegistry;

    #[test]
    fn resolves_glm_from_the_registry() {
        let registry = ProviderRegistry::default();
        assert!(registry.get("glm").is_some());
        assert!(registry.get("GLM").is_some());
    }

    #[test]
    fn rejects_unknown_provider_ids() {
        let registry = ProviderRegistry::default();
        assert!(registry.get("not-real").is_none());
    }
}
```

- [ ] **Step 2: Run the targeted Rust test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry::tests`
Expected: FAIL because the registry module does not exist yet.

- [ ] **Step 3: Extract current shared types and GLM provider behind a registry**

```rust
pub trait AiProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;
    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>>;
    async fn suggest_inline(&self, request: AiInlineSuggestionRequest) -> Result<Option<SuggestionResponse>>;
    async fn suggest_recovery(&self, request: AiRecoverySuggestionRequest) -> Result<Option<SuggestionResponse>>;
    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult;
}
```

```rust
pub struct ProviderRegistry {
    providers: HashMap<&'static str, Arc<dyn AiProvider>>,
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        let glm: Arc<dyn AiProvider> = Arc::new(GlmProvider::default());
        Self {
            providers: HashMap::from([("glm", glm)]),
        }
    }
}
```

```rust
pub async fn complete(request: CompletionRequest) -> Result<Option<CompletionResponse>> {
    ProviderRegistry::default()
        .get(&request.provider)
        .map(|provider| provider.complete(request))
        .unwrap_or_else(|| async { Ok(None) })
        .await
}
```

- [ ] **Step 4: Re-run Rust AI tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry::tests glm`
Expected: PASS, with GLM behavior unchanged.

- [ ] **Step 5: Commit the Rust AI core split**

```bash
git add src-tauri/src/ai/mod.rs src-tauri/src/ai/types.rs src-tauri/src/ai/provider.rs src-tauri/src/ai/registry.rs src-tauri/src/ai/providers/mod.rs src-tauri/src/ai/providers/glm.rs
git commit -m "refactor: introduce ai provider registry"
```

### Task 6: Introduce the OpenAI-compatible provider family and migrate GLM onto it

**Files:**
- Create: `src-tauri/src/ai/providers/openai_compatible.rs`
- Modify: `src-tauri/src/ai/providers/glm.rs`
- Modify: `src-tauri/src/ai/provider.rs`
- Test: `src-tauri/src/ai/providers/openai_compatible.rs`
- Test: `src-tauri/src/ai/providers/glm.rs`

- [ ] **Step 1: Write failing helper tests for payload building and parsing**

```rust
#[test]
fn builds_chat_completions_url_from_base_url() {
    let descriptor = provider_descriptor("glm", "https://open.bigmodel.cn/api/paas/v4");
    assert_eq!(
        build_chat_completions_url(&descriptor),
        "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    );
}

#[test]
fn parses_openai_compatible_choices_into_completion_candidates() {
    let content = r#"{"choices":[{"message":{"content":"git push origin main"}}]}"#;
    let parsed = parse_completion_content("git pu", content);
    assert!(!parsed.is_empty());
}
```

- [ ] **Step 2: Run the new Rust helper tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml openai_compatible`
Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Extract the shared OpenAI-compatible transport**

```rust
pub struct OpenAiCompatibleDescriptor {
    pub id: &'static str,
    pub label: &'static str,
    pub base_url: &'static str,
}

pub async fn complete_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
    request: CompletionRequest,
) -> Result<Option<CompletionResponse>> {
    let url = format!("{}/chat/completions", descriptor.base_url.trim_end_matches('/'));
    let response = client
        .post(url)
        .bearer_auth(&request.api_key)
        .json(&build_completion_request_payload(&request))
        .send()
        .await?;
    parse_completion_response(request.prefix, response).await
}
```

- [ ] **Step 4: Re-run helper and GLM regression tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml openai_compatible glm`
Expected: PASS

- [ ] **Step 5: Commit the shared provider family**

```bash
git add src-tauri/src/ai/providers/openai_compatible.rs src-tauri/src/ai/providers/glm.rs src-tauri/src/ai/provider.rs
git commit -m "refactor: move glm onto openai-compatible ai provider helper"
```

### Task 7: Add OpenAI-compatible providers to the registry

**Files:**
- Create: `src-tauri/src/ai/providers/openai.rs`
- Create: `src-tauri/src/ai/providers/xai.rs`
- Create: `src-tauri/src/ai/providers/deepseek.rs`
- Create: `src-tauri/src/ai/providers/qwen.rs`
- Create: `src-tauri/src/ai/providers/doubao.rs`
- Modify: `src-tauri/src/ai/providers/mod.rs`
- Modify: `src-tauri/src/ai/registry.rs`
- Test: `src-tauri/src/ai/registry.rs`

- [ ] **Step 1: Write failing registry coverage tests for the new providers**

```rust
#[test]
fn registers_all_openai_compatible_first_wave_providers() {
    let registry = ProviderRegistry::default();
    for id in ["openai", "xai", "glm", "deepseek", "qwen", "doubao"] {
        assert!(registry.get(id).is_some(), "missing provider: {id}");
    }
}
```

- [ ] **Step 2: Run the registry test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registers_all_openai_compatible_first_wave_providers`
Expected: FAIL because only GLM is registered.

- [ ] **Step 3: Add thin provider modules around the shared family helper**

```rust
#[derive(Default)]
pub struct OpenAiProvider;

#[async_trait]
impl AiProvider for OpenAiProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor::openai_compatible("openai", "OpenAI", "https://api.openai.com/v1")
    }

    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>> {
        complete_with_openai_compatible(&self.descriptor().into_openai_compatible()?, &build_client(COMPLETION_REQUEST_TIMEOUT_MS), request).await
    }
}
```

```rust
let providers: [(&'static str, Arc<dyn AiProvider>); 6] = [
    ("openai", Arc::new(OpenAiProvider::default())),
    ("xai", Arc::new(XAiProvider::default())),
    ("glm", Arc::new(GlmProvider::default())),
    ("deepseek", Arc::new(DeepSeekProvider::default())),
    ("qwen", Arc::new(QwenProvider::default())),
    ("doubao", Arc::new(DoubaoProvider::default())),
];
```

- [ ] **Step 4: Re-run registry and AI backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry`
Expected: PASS

- [ ] **Step 5: Commit the OpenAI-compatible provider expansion**

```bash
git add src-tauri/src/ai/providers/openai.rs src-tauri/src/ai/providers/xai.rs src-tauri/src/ai/providers/deepseek.rs src-tauri/src/ai/providers/qwen.rs src-tauri/src/ai/providers/doubao.rs src-tauri/src/ai/providers/mod.rs src-tauri/src/ai/registry.rs
git commit -m "feat: add openai-compatible ai providers"
```

### Task 8: Add Anthropic and Gemini providers with provider-specific transport

**Files:**
- Create: `src-tauri/src/ai/providers/anthropic.rs`
- Create: `src-tauri/src/ai/providers/gemini.rs`
- Modify: `src-tauri/src/ai/providers/mod.rs`
- Modify: `src-tauri/src/ai/registry.rs`
- Test: `src-tauri/src/ai/providers/anthropic.rs`
- Test: `src-tauri/src/ai/providers/gemini.rs`

- [ ] **Step 1: Write failing descriptor and auth tests for Anthropic and Gemini**

```rust
#[test]
fn anthropic_descriptor_exposes_expected_base_url() {
    let provider = AnthropicProvider::default();
    assert_eq!(provider.descriptor().id, "anthropic");
    assert_eq!(provider.descriptor().default_base_url, "https://api.anthropic.com/v1");
}

#[test]
fn gemini_descriptor_exposes_expected_base_url() {
    let provider = GeminiProvider::default();
    assert_eq!(provider.descriptor().id, "gemini");
    assert_eq!(provider.descriptor().default_base_url, "https://generativelanguage.googleapis.com/v1beta");
}
```

- [ ] **Step 2: Run the new Rust provider tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml anthropic gemini`
Expected: FAIL because the providers do not exist yet.

- [ ] **Step 3: Implement dedicated Anthropic and Gemini modules**

```rust
#[async_trait]
impl AiProvider for AnthropicProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor::new("anthropic", "Anthropic", "anthropic", vec![ProviderCapability::Completion, ProviderCapability::InlineSuggestion, ProviderCapability::RecoverySuggestion, ProviderCapability::ConnectionTest], "https://api.anthropic.com/v1", AuthStrategy::Bearer)
    }

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        post_test_request(
            &self.connection_test_client,
            format!("{}/messages", effective_base_url(&request.base_url, self.descriptor().default_base_url)),
            build_anthropic_headers(&request.api_key),
            build_anthropic_test_payload(&request.model),
        ).await
    }
}
```

```rust
#[async_trait]
impl AiProvider for GeminiProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor::new("gemini", "Gemini", "gemini", vec![ProviderCapability::Completion, ProviderCapability::InlineSuggestion, ProviderCapability::RecoverySuggestion, ProviderCapability::ConnectionTest], "https://generativelanguage.googleapis.com/v1beta", AuthStrategy::Bearer)
    }
}
```

- [ ] **Step 4: Re-run the targeted Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml anthropic gemini registry`
Expected: PASS

- [ ] **Step 5: Commit the dedicated provider implementations**

```bash
git add src-tauri/src/ai/providers/anthropic.rs src-tauri/src/ai/providers/gemini.rs src-tauri/src/ai/providers/mod.rs src-tauri/src/ai/registry.rs
git commit -m "feat: add anthropic and gemini ai providers"
```

### Task 9: Remove remaining GLM-only assumptions and align frontend/backend contracts

**Files:**
- Modify: `src-tauri/src/ai/mod.rs`
- Modify: `src-tauri/src/config/mod.rs`
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/features/config/lib/ai-connection.test.ts`
- Modify: `src/domain/config/model.test.ts`
- Test: `src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write failing parity and legacy-config tests**

```rust
#[test]
fn default_config_does_not_force_a_provider() {
    let config = AppConfig::default();
    assert_eq!(config.ai.provider, "");
    assert_eq!(config.ai.model, "");
}
```

```ts
it("keeps GLM connection errors readable after provider abstraction", () => {
  expect(
    describeAiConnectionResult({
      status: "provider_error",
      message: "{\"error\":{\"code\":\"1302\",\"message\":\"rate limit\"}}",
    }),
  ).toBe("GLM rate limit reached (1302): rate limit");
});
```

- [ ] **Step 2: Run the targeted parity tests**

Run: `npm test -- src/features/config/lib/ai-connection.test.ts src/domain/config/model.test.ts`
Expected: FAIL if any GLM-only assumptions remain in config hydration or result formatting.

Run: `cargo test --manifest-path src-tauri/Cargo.toml config`
Expected: FAIL if backend config structs have not been updated for `base_url`.

- [ ] **Step 3: Finish the contract cleanup**

```rust
pub use provider::{AiProvider, AuthStrategy, ProviderCapability, ProviderDescriptor};
pub use registry::ProviderRegistry;
pub use types::{
    AiInlineSuggestionRequest, AiRecoverySuggestionRequest, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, SuggestionResponse,
};
```

```rust
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub base_url: String,
    pub api_key: String,
}
```

```tsx
const connectionSummary = `${selectedProvider?.label ?? config.ai.provider} / ${config.ai.model}`;
```

- [ ] **Step 4: Run the cross-layer verification suite**

Run: `npm test -- src/domain/config/model.test.ts src/features/config/lib/ai-connection.test.ts src/features/terminal/lib/ghost-completion.test.ts src/features/terminal/lib/suggestion-engine.test.ts`
Expected: PASS

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit the abstraction cleanup**

```bash
git add src-tauri/src/ai/mod.rs src-tauri/src/config/mod.rs src/features/config/components/SettingsPanel.tsx src/features/config/lib/ai-connection.test.ts src/domain/config/model.test.ts
git commit -m "refactor: remove remaining glm-only ai assumptions"
```

### Task 10: Final verification and release notes update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the supported provider matrix**

```md
## AI Providers

PRAW supports the following AI providers for ghost completion, inline suggestions, recovery suggestions, and connection testing:

- OpenAI
- Anthropic
- Gemini
- xAI
- GLM
- DeepSeek
- Qwen
- Doubao
```

- [ ] **Step 2: Run end-to-end verification**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 3: Smoke-test the Tauri build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit docs and verification updates**

```bash
git add README.md
git commit -m "docs: add multi-provider ai support"
```

- [ ] **Step 5: Record the rollout checklist**

```md
- Verify GLM legacy config still hydrates correctly
- Verify provider dropdown shows all eight vendors
- Verify `baseUrl` is editable and optional
- Verify OpenAI-compatible vendors use the shared transport
- Verify Anthropic and Gemini connection tests succeed with valid credentials
```
