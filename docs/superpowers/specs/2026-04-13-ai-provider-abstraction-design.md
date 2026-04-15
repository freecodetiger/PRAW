# AI Provider Abstraction Design

## Goal

Upgrade the current AI integration from a single-provider GLM implementation into a real provider abstraction that supports major domestic and international vendors without scattering provider-specific logic across the frontend and backend.

First-wave providers:

- `openai`
- `anthropic`
- `gemini`
- `xai`
- `glm`
- `deepseek`
- `qwen`
- `doubao`

## Current Problems

- Frontend provider catalog exposes only `glm`.
- Frontend types narrow the provider identifier to `"glm"`.
- Request gating in completion and suggestion flows hard-codes `provider === "glm"`.
- Rust exposes an `AiProvider` trait, but runtime dispatch is still implemented as top-level `match` statements.
- Provider-specific request building, transport details, and error mapping are concentrated in one backend module.

This creates a false abstraction: the API surface looks generic, but the behavior is still single-provider.

## Design Principles

- Frontend calls should depend on capabilities, not provider names.
- Backend dispatch should depend on a registry, not repeated `match` statements.
- Provider-specific behavior should be isolated in provider modules or shared provider-family helpers.
- Existing GLM users must keep working without migration friction.
- The first implementation should not over-expose advanced provider settings in the UI, but the internal model should support them.

## Architecture

The AI subsystem will be split into four layers.

### 1. Frontend Catalog Layer

The provider catalog becomes structured metadata instead of a simple dropdown list.

Each provider entry defines:

- `id`
- `label`
- `family`
- `capabilities`
- `defaultBaseUrl`
- `defaultModelHints`
- `authStrategy`

This catalog is the source of truth for UI labels, capability checks, and provider-specific defaults.

### 2. Frontend Request/Build Layer

Frontend request builders for:

- ghost completion
- inline suggestions
- recovery suggestions
- connection testing

must stop checking `provider === "glm"`.

They should instead check:

- AI is enabled
- provider exists
- model/API key/base URL requirements are satisfied
- the provider supports the requested capability

This makes all supported providers flow through the same frontend path.

### 3. Backend Registry Layer

The Rust backend will expose a `ProviderRegistry` that resolves providers by normalized identifier.

Top-level backend entry points should only do:

- normalize provider id
- resolve provider from registry
- call provider trait method
- map errors to the shared frontend-facing result shape

No backend entry point should contain hard-coded per-provider `match` logic once the migration is complete.

### 4. Backend Provider Implementation Layer

Provider-specific behavior moves into dedicated modules.

Shared protocol families are extracted where appropriate:

- `openai_compatible`
- `anthropic_compatible`
- `gemini_compatible`

This keeps per-provider modules small and prevents duplicating request/response glue for vendors with similar APIs.

## Backend Module Layout

Recommended Rust structure:

```text
src-tauri/src/ai/
  mod.rs
  types.rs
  provider.rs
  registry.rs
  providers/
    mod.rs
    openai_compatible.rs
    anthropic.rs
    gemini.rs
    openai.rs
    xai.rs
    glm.rs
    deepseek.rs
    qwen.rs
    doubao.rs
```

Responsibilities:

- `mod.rs`: public entry points and registry wiring
- `types.rs`: shared request/response/config/error types
- `provider.rs`: provider trait, capability enum, descriptor types
- `registry.rs`: provider lookup and supported-provider listing
- `providers/*`: concrete providers and family helpers

## Provider Trait and Descriptor

The provider abstraction should expose both execution behavior and metadata.

Suggested responsibilities:

- `descriptor() -> ProviderDescriptor`
- `complete(...)`
- `inline_suggestions(...)`
- `recovery_suggestions(...)`
- `test_connection(...)`

`ProviderDescriptor` should include:

- `id`
- `label`
- `family`
- `capabilities`
- `default_base_url`
- `auth_strategy`

This allows both backend runtime dispatch and frontend parity with catalog metadata.

## Configuration Model

The AI config should evolve from a minimal tuple into a provider profile.

Publicly retained fields:

- `provider`
- `model`
- `apiKey`

New internal fields:

- `baseUrl`
- `organization` optional
- `project` optional
- `extraHeaders` optional
- `enabledCapabilities` optional override
- `connectionPreset` optional

The settings UI should only expose the first practical set in wave one:

- `Provider`
- `Model`
- `API Key`
- `Base URL`

Advanced fields remain internal until they are needed.

## Capability Model

The provider capability matrix should be explicit and shared conceptually across frontend and backend.

Initial capabilities:

- `completion`
- `inlineSuggestion`
- `recoverySuggestion`
- `connectionTest`

For wave one, all eight providers are expected to support all four capabilities. If a provider later loses support for one capability, only its metadata and backend implementation should change. Frontend orchestration should remain generic.

## Frontend Changes

### Catalog and Types

- Expand `CompletionProvider` from a single literal to a real provider union.
- Replace the single-value provider option list with a structured catalog.
- Keep normalization logic in config hydration so legacy provider values still normalize cleanly.

### Settings Panel

- Provider dropdown should list all eight providers.
- Model input remains freeform in wave one.
- Base URL becomes editable and defaults to the selected provider's default base URL when blank.
- Connection testing should use the selected provider profile instead of assuming GLM semantics.

### Request Gating

All request gating in:

- ghost completion
- inline suggestions
- recovery suggestions

must depend on:

- provider presence
- capability support
- required config completeness

This removes vendor checks from feature logic.

## Backend Provider Families

### OpenAI-Compatible Family

Use a shared helper for vendors that can be normalized to the same chat-completions style transport and response parsing.

Expected early members:

- `openai`
- `glm`
- `deepseek`
- `qwen`
- `doubao`
- `xai`

The family helper should centralize:

- base URL handling
- auth header construction where compatible
- request payload building
- response parsing
- timeout handling
- common provider error mapping

### Anthropic Family

Anthropic remains its own provider module because request/response shape and auth headers differ enough to warrant a dedicated implementation.

### Gemini Family

Gemini remains its own provider module for the same reason. A small compatibility helper is acceptable, but it should not be forced into the OpenAI-compatible path.

## Migration Strategy

The migration should be incremental.

### Phase 1

- Extract current GLM logic into `providers/glm.rs`
- Introduce `ProviderRegistry`
- Register only `glm`
- Keep runtime behavior unchanged

### Phase 2

- Introduce shared `openai_compatible` family helper
- Move GLM to use the family helper

### Phase 3

- Add `openai`
- Add `deepseek`
- Add `qwen`
- Add `doubao`
- Add `xai`

### Phase 4

- Add `anthropic`
- Add `gemini`

### Phase 5

- Remove remaining frontend and backend `glm` special cases
- Complete settings-panel provider generalization

This sequencing keeps the system working after each step and minimizes blast radius.

## Error Handling

Error handling must remain shared at the product boundary.

The user-facing status model should still map into:

- `success`
- `auth_error`
- `network_error`
- `timeout`
- `config_error`
- `provider_error`

Provider modules can keep richer internal classification, but the external contract should remain stable for settings-panel UX and suggestion flows.

## Testing Strategy

### Frontend

- Catalog tests for provider definitions and capabilities
- Config normalization tests for legacy values and new `baseUrl`
- Request gating tests proving non-GLM providers work through the same logic
- Settings-panel tests for provider selection and config persistence

### Backend

- Registry tests for known/unknown providers
- Family helper tests for payload building and response parsing
- Provider tests for descriptor metadata, auth strategy, base URL, and connection-test behavior
- Error mapping tests per provider family

### Compatibility

- GLM regression tests must continue passing through every migration stage
- Legacy config should hydrate without data loss

## Risks

### Risk: Fake abstraction remains in helper code

If the family helpers accumulate vendor-specific conditionals, the design simply moves the single-provider problem to a different file.

Mitigation:

- keep helpers generic
- push vendor differences back into per-provider descriptors or overrides

### Risk: Frontend and backend capability maps drift

Mitigation:

- maintain a single shared conceptual schema
- keep provider ids and capability names consistent
- add tests that fail when a provider exists in one layer but not the other

### Risk: Settings complexity expands too quickly

Mitigation:

- keep wave-one UI minimal
- support advanced fields internally first

## Success Criteria

- The app can configure and test all eight first-wave providers.
- Frontend request logic contains no `provider === "glm"` checks.
- Backend runtime entry points contain no provider-specific `match` logic.
- GLM remains fully functional throughout migration.
- Provider-specific behavior is isolated to registry descriptors, provider modules, or family helpers.
