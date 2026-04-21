use std::collections::HashSet;
use std::time::Instant;

use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

use crate::ai::types::{
    AiInlineSuggestionRequest, AiIntentSuggestionRequest, AiRecoverySuggestionRequest,
    CompletionCandidate, CompletionCandidateSource, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, SuggestionResponse,
};
use crate::ai::{
    build_completion_request_payload, build_connection_test_payload,
    build_inline_suggestion_request_payload, build_intent_suggestion_request_payload,
    build_recovery_suggestion_request_payload, classify_candidate_kind, classify_transport_error,
    parse_completion_candidates, parse_inline_suggestion_items, parse_intent_suggestion_items,
    parse_recovery_suggestion_items, sanitize_candidate, send_openai_request,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiCompatibleDescriptor {
    pub id: &'static str,
    pub label: &'static str,
    pub base_url: &'static str,
}

pub fn build_chat_completions_url(descriptor: &OpenAiCompatibleDescriptor) -> String {
    build_chat_completions_url_from_base_url(descriptor.base_url)
}

pub fn resolve_base_url(base_url: &str, default_base_url: &str) -> String {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        default_base_url.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn build_chat_completions_url_from_base_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

pub fn parse_completion_content(prefix: &str, content: &str) -> Vec<CompletionCandidate> {
    let Ok(payload) = serde_json::from_str::<OpenAiCompatibleResponse>(content) else {
        return Vec::new();
    };

    let Some(message) = payload
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
    else {
        return Vec::new();
    };

    let Ok(entries) = serde_json::from_str::<Vec<String>>(message.trim()) else {
        return Vec::new();
    };

    let mut seen = HashSet::new();
    let mut suggestions = Vec::new();

    for (index, entry) in entries.into_iter().enumerate() {
        let Some(text) = sanitize_candidate(prefix, &entry) else {
            continue;
        };

        if !seen.insert(text.clone()) {
            continue;
        }

        suggestions.push(CompletionCandidate {
            text: text.clone(),
            source: CompletionCandidateSource::Ai,
            score: 900u16.saturating_sub((index as u16) * 10),
            kind: classify_candidate_kind(&text),
        });
    }

    suggestions
}

pub async fn complete_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
    request: CompletionRequest,
) -> Result<Option<CompletionResponse>> {
    if request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
        || request.prefix.trim().is_empty()
    {
        return Ok(None);
    }

    let started_at = Instant::now();
    let base_url = resolve_base_url(&request.base_url, descriptor.base_url);
    let payload = send_openai_request(
        client,
        &build_chat_completions_url_from_base_url(&base_url),
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

    let suggestions = parse_completion_candidates(&request, &content);
    if suggestions.is_empty() {
        return Ok(None);
    }

    Ok(Some(CompletionResponse {
        suggestions,
        latency_ms: started_at.elapsed().as_millis() as u64,
    }))
}

pub async fn suggest_inline_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
    request: AiInlineSuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    if request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
        || request.draft.trim().is_empty()
    {
        return Ok(None);
    }

    let started_at = Instant::now();
    let base_url = resolve_base_url(&request.base_url, descriptor.base_url);
    let payload = send_openai_request(
        client,
        &build_chat_completions_url_from_base_url(&base_url),
        request.api_key.trim(),
        &build_inline_suggestion_request_payload(&request),
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

    let suggestions = parse_inline_suggestion_items(&request, &content);
    if suggestions.is_empty() {
        return Ok(None);
    }

    Ok(Some(SuggestionResponse {
        suggestions,
        latency_ms: started_at.elapsed().as_millis() as u64,
    }))
}

pub async fn suggest_recovery_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
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
    let base_url = resolve_base_url(&request.base_url, descriptor.base_url);
    let payload = send_openai_request(
        client,
        &build_chat_completions_url_from_base_url(&base_url),
        request.api_key.trim(),
        &build_recovery_suggestion_request_payload(&request),
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

    let suggestions = parse_recovery_suggestion_items(&request, &content);
    if suggestions.is_empty() {
        return Ok(None);
    }

    Ok(Some(SuggestionResponse {
        suggestions,
        latency_ms: started_at.elapsed().as_millis() as u64,
    }))
}

pub async fn suggest_intent_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
    request: AiIntentSuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    if request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
        || request.draft.trim().is_empty()
    {
        return Ok(None);
    }

    let started_at = Instant::now();
    let base_url = resolve_base_url(&request.base_url, descriptor.base_url);
    let payload = send_openai_request(
        client,
        &build_chat_completions_url_from_base_url(&base_url),
        request.api_key.trim(),
        &build_intent_suggestion_request_payload(&request),
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

    let suggestions = parse_intent_suggestion_items(&content);
    if suggestions.is_empty() {
        return Ok(None);
    }

    Ok(Some(SuggestionResponse {
        suggestions,
        latency_ms: started_at.elapsed().as_millis() as u64,
    }))
}

pub async fn test_connection_with_openai_compatible(
    descriptor: &OpenAiCompatibleDescriptor,
    client: &Client,
    request: ConnectionTestRequest,
) -> ConnectionTestResult {
    let started_at = Instant::now();
    let base_url = resolve_base_url(&request.base_url, descriptor.base_url);
    let response = send_openai_request(
        client,
        &build_chat_completions_url_from_base_url(&base_url),
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

#[derive(Debug, Deserialize)]
struct OpenAiCompatibleResponse {
    choices: Vec<OpenAiCompatibleChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiCompatibleChoice {
    message: OpenAiCompatibleMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiCompatibleMessage {
    content: String,
}

#[cfg(test)]
mod tests {
    use crate::ai::types::{
        CompletionCandidateSource, CompletionRequest, CwdSummary, SystemSummary,
    };

    use super::{build_chat_completions_url, parse_completion_content, OpenAiCompatibleDescriptor};

    fn request(prefix: &str) -> CompletionRequest {
        CompletionRequest {
            provider: "glm".to_string(),
            model: "glm-4.7-flash".to_string(),
            api_key: "secret-key".to_string(),
            base_url: String::new(),
            prefix: prefix.to_string(),
            pwd: "/USER/project".to_string(),
            git_branch: Some("main".to_string()),
            git_status_summary: vec!["M src/main.rs".to_string()],
            recent_history: vec!["git status".to_string()],
            cwd_summary: CwdSummary {
                dirs: vec!["src".to_string()],
                files: vec!["Cargo.toml".to_string()],
            },
            system_summary: SystemSummary {
                os: "ubuntu".to_string(),
                shell: "/bin/bash".to_string(),
                package_manager: "apt".to_string(),
            },
            tool_availability: vec!["git".to_string()],
            session_id: "sess-1".to_string(),
            user_id: "user-1".to_string(),
        }
    }

    #[test]
    fn builds_chat_completions_url_from_base_url() {
        let descriptor = OpenAiCompatibleDescriptor {
            id: "glm",
            label: "GLM",
            base_url: "https://open.bigmodel.cn/api/paas/v4",
        };

        assert_eq!(
            build_chat_completions_url(&descriptor),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
    }

    #[test]
    fn parses_openai_compatible_choices_into_completion_candidates() {
        let parsed = parse_completion_content(
            &request("git pu").prefix,
            r#"{"choices":[{"message":{"content":"[\"git push origin main\"]"}}]}"#,
        );

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].text, "git push origin main");
        assert_eq!(parsed[0].source, CompletionCandidateSource::Ai);
    }
}
