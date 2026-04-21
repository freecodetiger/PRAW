use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::ai::provider::{AiProvider, ProviderDescriptor};
use crate::ai::types::{
    AiInlineSuggestionRequest, AiIntentSuggestionRequest, AiRecoverySuggestionRequest,
    CompletionRequest, CompletionResponse, ConnectionTestRequest, ConnectionTestResult,
    SuggestionResponse,
};
use crate::ai::{
    build_client, build_completion_prompt_messages, build_connection_test_prompt_messages,
    build_inline_suggestion_prompt_messages, build_intent_suggestion_prompt_messages,
    build_recovery_suggestion_prompt_messages, classify_transport_error, normalize_identifier,
    parse_completion_candidates, parse_inline_suggestion_items, parse_intent_suggestion_items,
    parse_recovery_suggestion_items, COMPLETION_REQUEST_TIMEOUT_MS, CONNECTION_TEST_TIMEOUT_MS,
};

const GEMINI_TEMPERATURE: f32 = 0.1;
const GEMINI_MAX_TOKENS: u16 = 160;
const GEMINI_TEST_MAX_TOKENS: u16 = 12;

pub struct GeminiProvider {
    completion_client: Client,
    connection_test_client: Client,
}

impl Default for GeminiProvider {
    fn default() -> Self {
        Self {
            completion_client: build_client(COMPLETION_REQUEST_TIMEOUT_MS),
            connection_test_client: build_client(CONNECTION_TEST_TIMEOUT_MS),
        }
    }
}

impl GeminiProvider {
    fn generate_content_url(&self, model: &str) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            normalize_identifier(model)
        )
    }

    fn generate_content_url_with_base_url(&self, base_url: &str, model: &str) -> String {
        format!(
            "{}/models/{}:generateContent",
            base_url.trim_end_matches('/'),
            normalize_identifier(model)
        )
    }

    async fn send_request(
        &self,
        client: &Client,
        base_url: &str,
        api_key: &str,
        model: &str,
        payload: &GeminiGenerateContentRequest,
    ) -> Result<GeminiGenerateContentResponse> {
        let response = client
            .post(self.generate_content_url_with_base_url(base_url, model))
            .header("x-goog-api-key", api_key)
            .json(payload)
            .send()
            .await
            .context("failed to send gemini request")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("http:{}:{}", status.as_u16(), body));
        }

        response
            .json::<GeminiGenerateContentResponse>()
            .await
            .context("failed to parse gemini response")
    }

    fn build_request(
        &self,
        system: String,
        user: String,
        max_tokens: u16,
        temperature: f32,
    ) -> GeminiGenerateContentRequest {
        GeminiGenerateContentRequest {
            system_instruction: Some(GeminiInstruction {
                parts: vec![GeminiPart { text: system }],
            }),
            contents: vec![GeminiUserContent {
                parts: vec![GeminiPart { text: user }],
            }],
            generation_config: GeminiGenerationConfig {
                temperature,
                max_output_tokens: max_tokens,
            },
        }
    }

    fn extract_text(response: GeminiGenerateContentResponse) -> Option<String> {
        response
            .candidates
            .into_iter()
            .next()
            .and_then(|candidate| candidate.content)
            .and_then(|content| content.parts.into_iter().next())
            .map(|part| part.text.trim().to_string())
            .filter(|text| !text.is_empty())
    }
}

#[async_trait]
impl AiProvider for GeminiProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "gemini",
            label: "Gemini",
            default_base_url: "https://generativelanguage.googleapis.com/v1beta",
        }
    }

    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>> {
        if request.api_key.trim().is_empty()
            || request.model.trim().is_empty()
            || request.prefix.trim().is_empty()
        {
            return Ok(None);
        }

        let started_at = Instant::now();
        let (system, user) = build_completion_prompt_messages(&request);
        let base_url = if request.base_url.trim().is_empty() {
            self.descriptor().default_base_url.to_string()
        } else {
            request.base_url.trim().to_string()
        };
        let response = self
            .send_request(
                &self.completion_client,
                &base_url,
                request.api_key.trim(),
                &request.model,
                &self.build_request(system, user, GEMINI_MAX_TOKENS, GEMINI_TEMPERATURE),
            )
            .await?;

        let Some(content) = Self::extract_text(response) else {
            return Ok(None);
        };

        let suggestions = parse_completion_candidates(&request, &content);
        if suggestions.is_empty() {
            return Ok(None);
        }

        Ok(Some(CompletionResponse {
            suggestions,
            latency_ms: started_at.elapsed().as_millis() as u64,
        }))
    }

    async fn suggest_inline(
        &self,
        request: AiInlineSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        if request.api_key.trim().is_empty()
            || request.model.trim().is_empty()
            || request.draft.trim().is_empty()
        {
            return Ok(None);
        }

        let started_at = Instant::now();
        let (system, user) = build_inline_suggestion_prompt_messages(&request);
        let base_url = if request.base_url.trim().is_empty() {
            self.descriptor().default_base_url.to_string()
        } else {
            request.base_url.trim().to_string()
        };
        let response = self
            .send_request(
                &self.completion_client,
                &base_url,
                request.api_key.trim(),
                &request.model,
                &self.build_request(system, user, GEMINI_MAX_TOKENS, GEMINI_TEMPERATURE),
            )
            .await?;

        let Some(content) = Self::extract_text(response) else {
            return Ok(None);
        };

        let suggestions = parse_inline_suggestion_items(&request, &content);
        if suggestions.is_empty() {
            return Ok(None);
        }

        Ok(Some(SuggestionResponse {
            suggestions,
            latency_ms: started_at.elapsed().as_millis() as u64,
        }))
    }

    async fn suggest_recovery(
        &self,
        request: AiRecoverySuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        if request.api_key.trim().is_empty()
            || request.model.trim().is_empty()
            || request.command.trim().is_empty()
            || request.exit_code == 0
        {
            return Ok(None);
        }

        let started_at = Instant::now();
        let (system, user) = build_recovery_suggestion_prompt_messages(&request);
        let base_url = if request.base_url.trim().is_empty() {
            self.descriptor().default_base_url.to_string()
        } else {
            request.base_url.trim().to_string()
        };
        let response = self
            .send_request(
                &self.completion_client,
                &base_url,
                request.api_key.trim(),
                &request.model,
                &self.build_request(system, user, GEMINI_MAX_TOKENS, GEMINI_TEMPERATURE),
            )
            .await?;

        let Some(content) = Self::extract_text(response) else {
            return Ok(None);
        };

        let suggestions = parse_recovery_suggestion_items(&request, &content);
        if suggestions.is_empty() {
            return Ok(None);
        }

        Ok(Some(SuggestionResponse {
            suggestions,
            latency_ms: started_at.elapsed().as_millis() as u64,
        }))
    }

    async fn suggest_intent(
        &self,
        request: AiIntentSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        if request.api_key.trim().is_empty()
            || request.model.trim().is_empty()
            || request.draft.trim().is_empty()
        {
            return Ok(None);
        }

        let started_at = Instant::now();
        let (system, user) = build_intent_suggestion_prompt_messages(&request);
        let base_url = if request.base_url.trim().is_empty() {
            self.descriptor().default_base_url.to_string()
        } else {
            request.base_url.trim().to_string()
        };
        let response = self
            .send_request(
                &self.completion_client,
                &base_url,
                request.api_key.trim(),
                &request.model,
                &self.build_request(system, user, GEMINI_MAX_TOKENS, GEMINI_TEMPERATURE),
            )
            .await?;

        let Some(content) = Self::extract_text(response) else {
            return Ok(None);
        };

        let suggestions = parse_intent_suggestion_items(&content);
        if suggestions.is_empty() {
            return Ok(None);
        }

        Ok(Some(SuggestionResponse {
            suggestions,
            latency_ms: started_at.elapsed().as_millis() as u64,
        }))
    }

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        let started_at = Instant::now();
        let (system, user) = build_connection_test_prompt_messages();
        let base_url = if request.base_url.trim().is_empty() {
            self.descriptor().default_base_url.to_string()
        } else {
            request.base_url.trim().to_string()
        };
        let response = self
            .send_request(
                &self.connection_test_client,
                &base_url,
                request.api_key.trim(),
                &request.model,
                &self.build_request(system, user, GEMINI_TEST_MAX_TOKENS, 0.0),
            )
            .await;

        match response {
            Ok(payload) => ConnectionTestResult {
                status: "success".to_string(),
                message: Self::extract_text(payload)
                    .unwrap_or_else(|| "Provider reachable".to_string()),
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            },
            Err(error) => classify_transport_error(error),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerateContentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiInstruction>,
    contents: Vec<GeminiUserContent>,
    generation_config: GeminiGenerationConfig,
}

#[derive(Debug, Serialize)]
struct GeminiInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiUserContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    temperature: f32,
    max_output_tokens: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerateContentResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiCandidateContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidateContent {
    parts: Vec<GeminiPart>,
}

#[cfg(test)]
mod tests {
    use super::GeminiProvider;
    use crate::ai::provider::AiProvider;

    #[test]
    fn gemini_descriptor_exposes_expected_base_url() {
        let provider = GeminiProvider::default();
        let descriptor = provider.descriptor();

        assert_eq!(descriptor.id, "gemini");
        assert_eq!(descriptor.label, "Gemini");
        assert_eq!(
            descriptor.default_base_url,
            "https://generativelanguage.googleapis.com/v1beta"
        );
    }
}
