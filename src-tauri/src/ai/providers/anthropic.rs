use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::ai::provider::{AiProvider, ProviderDescriptor};
use crate::ai::types::{
    AiInlineSuggestionRequest, AiRecoverySuggestionRequest, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, SuggestionResponse,
};
use crate::ai::{
    build_client, build_completion_prompt_messages, build_connection_test_prompt_messages,
    build_inline_suggestion_prompt_messages, build_recovery_suggestion_prompt_messages,
    classify_transport_error, normalize_identifier, parse_completion_candidates,
    parse_inline_suggestion_items, parse_recovery_suggestion_items,
    COMPLETION_REQUEST_TIMEOUT_MS, CONNECTION_TEST_TIMEOUT_MS,
};

const ANTHROPIC_API_VERSION: &str = "2023-06-01";
const ANTHROPIC_MAX_TOKENS: u16 = 160;
const ANTHROPIC_TEST_MAX_TOKENS: u16 = 12;
const ANTHROPIC_TEMPERATURE: f32 = 0.1;

pub struct AnthropicProvider {
    completion_client: Client,
    connection_test_client: Client,
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self {
            completion_client: build_client(COMPLETION_REQUEST_TIMEOUT_MS),
            connection_test_client: build_client(CONNECTION_TEST_TIMEOUT_MS),
        }
    }
}

impl AnthropicProvider {
    fn messages_url(&self, base_url: &str) -> String {
        format!("{}/messages", base_url.trim_end_matches('/'))
    }

    async fn send_request(
        &self,
        client: &Client,
        base_url: &str,
        api_key: &str,
        payload: &AnthropicMessagesRequest,
    ) -> Result<AnthropicMessagesResponse> {
        let response = client
            .post(self.messages_url(base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_API_VERSION)
            .json(payload)
            .send()
            .await
            .context("failed to send anthropic request")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("http:{}:{}", status.as_u16(), body));
        }

        response
            .json::<AnthropicMessagesResponse>()
            .await
            .context("failed to parse anthropic response")
    }

    fn build_messages_request(
        &self,
        model: &str,
        system: String,
        user: String,
    ) -> AnthropicMessagesRequest {
        AnthropicMessagesRequest {
            model: normalize_identifier(model),
            system,
            messages: vec![AnthropicInputMessage {
                role: "user",
                content: user,
            }],
            temperature: ANTHROPIC_TEMPERATURE,
            max_tokens: ANTHROPIC_MAX_TOKENS,
        }
    }

    fn build_test_request(&self, model: &str) -> AnthropicMessagesRequest {
        let (system, user) = build_connection_test_prompt_messages();

        AnthropicMessagesRequest {
            model: normalize_identifier(model),
            system,
            messages: vec![AnthropicInputMessage {
                role: "user",
                content: user,
            }],
            temperature: 0.0,
            max_tokens: ANTHROPIC_TEST_MAX_TOKENS,
        }
    }

    fn extract_text(response: AnthropicMessagesResponse) -> Option<String> {
        response
            .content
            .into_iter()
            .find(|block| block.kind == "text")
            .and_then(|block| block.text)
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty())
    }
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "anthropic",
            label: "Anthropic",
            default_base_url: "https://api.anthropic.com/v1",
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
                &self.build_messages_request(&request.model, system, user),
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
                &self.build_messages_request(&request.model, system, user),
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
                &self.build_messages_request(&request.model, system, user),
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

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        let started_at = Instant::now();
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
                &self.build_test_request(&request.model),
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
struct AnthropicMessagesRequest {
    model: String,
    system: String,
    messages: Vec<AnthropicInputMessage>,
    temperature: f32,
    max_tokens: u16,
}

#[derive(Debug, Serialize)]
struct AnthropicInputMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::AnthropicProvider;
    use crate::ai::provider::AiProvider;

    #[test]
    fn anthropic_descriptor_exposes_expected_base_url() {
        let provider = AnthropicProvider::default();
        let descriptor = provider.descriptor();

        assert_eq!(descriptor.id, "anthropic");
        assert_eq!(descriptor.label, "Anthropic");
        assert_eq!(descriptor.default_base_url, "https://api.anthropic.com/v1");
    }
}
