#![allow(dead_code)]

use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::{Client, Error as ReqwestError, StatusCode};
use serde::{Deserialize, Serialize};

const GLM_CHAT_COMPLETIONS_URL: &str = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const COMPLETION_REQUEST_TIMEOUT_MS: u64 = 1_200;
const CONNECTION_TEST_TIMEOUT_MS: u64 = 8_000;
const MAX_RECENT_COMMANDS: usize = 8;
const MAX_SUGGESTION_CHARS: usize = 120;
const COMPLETION_TEMPERATURE: f32 = 0.1;
const COMPLETION_MAX_TOKENS: u16 = 48;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub shell: String,
    pub os: String,
    pub cwd: String,
    pub input_prefix: String,
    pub recent_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub suggestion: String,
    pub replace_range: Option<(usize, usize)>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub status: String,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>>;
    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult;
}

pub async fn complete(request: CompletionRequest) -> Result<Option<CompletionResponse>> {
    match normalize_identifier(&request.provider).as_str() {
        "glm" => GlmProvider::default().complete(request).await,
        _ => Ok(None),
    }
}

pub async fn test_connection(request: ConnectionTestRequest) -> ConnectionTestResult {
    match validate_connection_test_request(&request) {
        Ok(()) => match normalize_identifier(&request.provider).as_str() {
            "glm" => GlmProvider::default().test_connection(request).await,
            _ => ConnectionTestResult {
                status: "provider_error".to_string(),
                message: format!("Unsupported provider: {}", request.provider),
                latency_ms: None,
            },
        },
        Err(result) => result,
    }
}

pub struct GlmProvider {
    completion_client: Client,
    connection_test_client: Client,
}

impl Default for GlmProvider {
    fn default() -> Self {
        Self {
            completion_client: build_client(COMPLETION_REQUEST_TIMEOUT_MS),
            connection_test_client: build_client(CONNECTION_TEST_TIMEOUT_MS),
        }
    }
}

impl GlmProvider {
    fn completion_timeout_ms(&self) -> u64 {
        COMPLETION_REQUEST_TIMEOUT_MS
    }

    fn connection_test_timeout_ms(&self) -> u64 {
        CONNECTION_TEST_TIMEOUT_MS
    }
}

#[async_trait]
impl AiProvider for GlmProvider {
    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>> {
        if request.api_key.trim().is_empty() || request.input_prefix.trim().is_empty() {
            return Ok(None);
        }

        let started_at = Instant::now();
        let payload = send_openai_request(
            &self.completion_client,
            request.api_key.trim(),
            &build_completion_request_payload(&request),
        )
        .await?;

        let Some(content) = payload
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
        else {
            return Ok(None);
        };

        let Some(suggestion) = sanitize_completion_suffix(&request, &content) else {
            return Ok(None);
        };

        Ok(Some(CompletionResponse {
            suggestion,
            replace_range: None,
            latency_ms: started_at.elapsed().as_millis() as u64,
        }))
    }

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        let started_at = Instant::now();
        let response = send_openai_request(
            &self.connection_test_client,
            request.api_key.trim(),
            &build_connection_test_payload(&request.model),
        )
        .await;

        match response {
            Ok(payload) => {
                let message = payload
                    .choices
                    .into_iter()
                    .next()
                    .map(|choice| choice.message.content.trim().to_string())
                    .filter(|content| !content.is_empty())
                    .unwrap_or_else(|| "Provider reachable".to_string());

                ConnectionTestResult {
                    status: "success".to_string(),
                    message,
                    latency_ms: Some(started_at.elapsed().as_millis() as u64),
                }
            }
            Err(error) => classify_transport_error(error),
        }
    }
}

#[derive(Debug, Serialize)]
struct OpenAiChatCompletionRequest {
    model: String,
    messages: Vec<OpenAiChatMessage>,
    temperature: f32,
    max_tokens: u16,
}

#[derive(Debug, Serialize)]
struct OpenAiChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatCompletionResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: String,
}

fn build_client(timeout_ms: u64) -> Client {
    Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .expect("ghost completion HTTP client should build")
}

async fn send_openai_request(
    client: &Client,
    api_key: &str,
    payload: &OpenAiChatCompletionRequest,
) -> Result<OpenAiChatCompletionResponse> {
    let response = client
        .post(GLM_CHAT_COMPLETIONS_URL)
        .bearer_auth(api_key)
        .json(payload)
        .send()
        .await
        .context("failed to send completion request")?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("http:{}:{}", status.as_u16(), body));
    }

    response
        .json::<OpenAiChatCompletionResponse>()
        .await
        .context("failed to parse completion response")
}

fn build_completion_request_payload(request: &CompletionRequest) -> OpenAiChatCompletionRequest {
    let recent_commands = request
        .recent_commands
        .iter()
        .rev()
        .take(MAX_RECENT_COMMANDS)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    let recent_commands_block = if recent_commands.is_empty() {
        "(none)".to_string()
    } else {
        recent_commands.join("\n")
    };

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: [
                    "You produce ghost completions for an Ubuntu shell composer.",
                    "Return only the missing suffix that should be appended to the user input.",
                    "Never explain, never use markdown, never wrap the answer in quotes, and never emit more than one line.",
                    "If no strong completion is available, return an empty response.",
                ]
                .join(" "),
            },
            OpenAiChatMessage {
                role: "user",
                content: format!(
                    "shell: {}\nos: {}\ncwd: {}\nrecent_commands:\n{}\ninput_prefix: {}\ncompletion_suffix:",
                    request.shell,
                    request.os,
                    request.cwd,
                    recent_commands_block,
                    request.input_prefix,
                ),
            },
        ],
    }
}

fn build_connection_test_payload(model: &str) -> OpenAiChatCompletionRequest {
    OpenAiChatCompletionRequest {
        model: normalize_identifier(model),
        temperature: 0.0,
        max_tokens: 12,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: "Reply with OK only.".to_string(),
            },
            OpenAiChatMessage {
                role: "user",
                content: "ping".to_string(),
            },
        ],
    }
}

fn validate_connection_test_request(request: &ConnectionTestRequest) -> std::result::Result<(), ConnectionTestResult> {
    if request.api_key.trim().is_empty() {
        return Err(ConnectionTestResult {
            status: "config_error".to_string(),
            message: "API key is required".to_string(),
            latency_ms: None,
        });
    }

    if request.model.trim().is_empty() {
        return Err(ConnectionTestResult {
            status: "config_error".to_string(),
            message: "Model is required".to_string(),
            latency_ms: None,
        });
    }

    Ok(())
}

fn normalize_identifier(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn classify_transport_error(error: anyhow::Error) -> ConnectionTestResult {
    if let Some(reqwest_error) = error.downcast_ref::<ReqwestError>() {
        if reqwest_error.is_timeout() {
            return ConnectionTestResult {
                status: "timeout".to_string(),
                message: "request timed out".to_string(),
                latency_ms: None,
            };
        }

        if reqwest_error.is_connect() || reqwest_error.is_request() {
            return ConnectionTestResult {
                status: "network_error".to_string(),
                message: reqwest_error.to_string(),
                latency_ms: None,
            };
        }
    }

    let text = error.to_string();
    if let Some(result) = classify_http_error_message(&text) {
        return result;
    }

    ConnectionTestResult {
        status: "provider_error".to_string(),
        message: text,
        latency_ms: None,
    }
}

fn classify_http_error_message(message: &str) -> Option<ConnectionTestResult> {
    if let Some((status_code, body)) = parse_http_error_message(message) {
        let status = StatusCode::from_u16(status_code).ok();
        let trimmed_body = body.trim();
        let fallback_message = if trimmed_body.is_empty() {
            format!("HTTP {}", status_code)
        } else {
            trimmed_body.to_string()
        };

        let kind = match status {
            Some(StatusCode::UNAUTHORIZED) | Some(StatusCode::FORBIDDEN) => "auth_error",
            Some(StatusCode::BAD_REQUEST)
            | Some(StatusCode::NOT_FOUND)
            | Some(StatusCode::TOO_MANY_REQUESTS)
            | Some(StatusCode::UNPROCESSABLE_ENTITY) => "provider_error",
            _ => "provider_error",
        };

        return Some(ConnectionTestResult {
            status: kind.to_string(),
            message: fallback_message,
            latency_ms: None,
        });
    }

    None
}

fn parse_http_error_message(message: &str) -> Option<(u16, &str)> {
    let payload = message.strip_prefix("http:")?;
    let (status, body) = payload.split_once(':')?;
    let status_code = status.parse::<u16>().ok()?;
    Some((status_code, body))
}

fn sanitize_completion_suffix(request: &CompletionRequest, raw: &str) -> Option<String> {
    let candidate = raw.trim_matches(|character| character == '\n' || character == '\r');
    if candidate.trim().is_empty() || candidate.contains('\n') || candidate.contains('\r') {
        return None;
    }

    let suffix = candidate
        .strip_prefix(request.input_prefix.as_str())
        .unwrap_or(candidate);

    if suffix.is_empty() || suffix.chars().count() > MAX_SUGGESTION_CHARS {
        return None;
    }

    Some(suffix.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        build_completion_request_payload, build_connection_test_payload, classify_http_error_message,
        sanitize_completion_suffix, validate_connection_test_request, CompletionRequest,
        CompletionResponse, ConnectionTestRequest, ConnectionTestResult, GlmProvider,
    };

    fn request(prefix: &str) -> CompletionRequest {
        CompletionRequest {
            provider: "glm".to_string(),
            model: "glm-5-flash".to_string(),
            api_key: "secret-key".to_string(),
            shell: "/bin/bash".to_string(),
            os: "ubuntu".to_string(),
            cwd: "/workspace".to_string(),
            input_prefix: prefix.to_string(),
            recent_commands: vec!["git status".to_string(), "git add .".to_string()],
        }
    }

    #[test]
    fn strips_echoed_prefix_and_keeps_only_suffix() {
        let suggestion = sanitize_completion_suffix(&request("git ch"), "git checkout ");
        assert_eq!(suggestion, Some("eckout ".to_string()));
    }

    #[test]
    fn rejects_multiline_and_blank_responses() {
        assert_eq!(sanitize_completion_suffix(&request("git ch"), "\n"), None);
        assert_eq!(sanitize_completion_suffix(&request("git ch"), "checkout\nstatus"), None);
    }

    #[test]
    fn builds_a_clean_completion_response() {
        let response = CompletionResponse {
            suggestion: sanitize_completion_suffix(&request("git ch"), "git checkout ")
                .expect("suffix should survive"),
            replace_range: None,
            latency_ms: 12,
        };

        assert_eq!(
            response,
            CompletionResponse {
                suggestion: "eckout ".to_string(),
                replace_range: None,
                latency_ms: 12,
            }
        );
    }

    #[test]
    fn builds_openai_compatible_prompt_with_recent_commands() {
        let payload = build_completion_request_payload(&request("git ch"));
        let user_message = payload
            .messages
            .iter()
            .find(|message| message.role == "user")
            .expect("user message should exist");

        assert!(user_message.content.contains("input_prefix: git ch"));
        assert!(user_message.content.contains("git status"));
        assert!(user_message.content.contains("git add ."));
    }

    #[test]
    fn validates_connection_test_requests_before_network_calls() {
        let result = validate_connection_test_request(&ConnectionTestRequest {
            provider: "glm".to_string(),
            model: "".to_string(),
            api_key: "".to_string(),
        });

        assert_eq!(
            result,
            Err(ConnectionTestResult {
                status: "config_error".to_string(),
                message: "API key is required".to_string(),
                latency_ms: None,
            })
        );
    }

    #[test]
    fn classifies_http_auth_and_provider_failures() {
        assert_eq!(
            classify_http_error_message("http:401:invalid api key"),
            Some(ConnectionTestResult {
                status: "auth_error".to_string(),
                message: "invalid api key".to_string(),
                latency_ms: None,
            })
        );
        assert_eq!(
            classify_http_error_message("http:404:model not found"),
            Some(ConnectionTestResult {
                status: "provider_error".to_string(),
                message: "model not found".to_string(),
                latency_ms: None,
            })
        );
    }

    #[test]
    fn normalizes_connection_probe_model_identifiers() {
        let payload = build_connection_test_payload("GLM-4.7-Flash");
        assert_eq!(payload.model, "glm-4.7-flash");
        assert_eq!(payload.messages.len(), 2);
        assert_eq!(payload.messages[1].content, "ping");
    }

    #[test]
    fn uses_longer_timeout_for_connection_probes() {
        let provider = GlmProvider::default();
        assert!(provider.connection_test_timeout_ms() > provider.completion_timeout_ms());
    }

    #[test]
    fn builds_a_minimal_connection_probe_payload() {
        let payload = build_connection_test_payload("glm-5-flash");
        assert_eq!(payload.model, "glm-5-flash");
        assert_eq!(payload.messages.len(), 2);
        assert_eq!(payload.messages[1].content, "ping");
    }
}
