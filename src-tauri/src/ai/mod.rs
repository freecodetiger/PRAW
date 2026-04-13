#![allow(dead_code)]

use std::collections::HashSet;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::{Client, Error as ReqwestError, StatusCode};
use serde::{Deserialize, Serialize};

pub mod provider;
pub mod providers;
pub mod registry;
pub mod types;

#[allow(unused_imports)]
pub use provider::{AiProvider, ProviderDescriptor};
#[allow(unused_imports)]
pub use types::{
    AiInlineSuggestionRequest, AiRecoverySuggestionRequest, CompletionCandidate,
    CompletionCandidateKind, CompletionCandidateSource, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, CwdSummary, SuggestionApplyMode, SuggestionGroup,
    SuggestionItem, SuggestionKind, SuggestionReplacement, SuggestionResponse, SystemSummary,
};

use self::registry::ProviderRegistry;

pub(crate) const COMPLETION_REQUEST_TIMEOUT_MS: u64 = 1_500;
pub(crate) const CONNECTION_TEST_TIMEOUT_MS: u64 = 8_000;
const MAX_RECENT_COMMANDS: usize = 8;
const MAX_STATUS_LINES: usize = 8;
const MAX_SUMMARY_ITEMS: usize = 8;
const MAX_SUGGESTION_CHARS: usize = 160;
const COMPLETION_TEMPERATURE: f32 = 0.1;
const COMPLETION_MAX_TOKENS: u16 = 160;
const MAX_COMPLETION_CANDIDATES: usize = 5;
const DANGEROUS_PATTERNS: &[&str] = &["rm -rf /", "mkfs", "shutdown", "reboot", "dd if="];

pub async fn complete(request: CompletionRequest) -> Result<Option<CompletionResponse>> {
    let Some(provider) = ProviderRegistry::default().get(&request.provider) else {
        return Ok(None);
    };

    provider.complete(request).await
}

pub async fn inline_suggestions(
    request: AiInlineSuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    let Some(provider) = ProviderRegistry::default().get(&request.provider) else {
        return Ok(None);
    };

    provider.suggest_inline(request).await
}

pub async fn recovery_suggestions(
    request: AiRecoverySuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    let Some(provider) = ProviderRegistry::default().get(&request.provider) else {
        return Ok(None);
    };

    provider.suggest_recovery(request).await
}

pub async fn test_connection(request: ConnectionTestRequest) -> ConnectionTestResult {
    match validate_connection_test_request(&request) {
        Ok(()) => match ProviderRegistry::default().get(&request.provider) {
            Some(provider) => provider.test_connection(request).await,
            None => ConnectionTestResult {
                status: "provider_error".to_string(),
                message: format!("Unsupported provider: {}", request.provider),
                latency_ms: None,
            },
        },
        Err(result) => result,
    }
}

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiChatCompletionRequest {
    model: String,
    messages: Vec<OpenAiChatMessage>,
    temperature: f32,
    max_tokens: u16,
}

#[derive(Debug, Serialize)]
pub(crate) struct OpenAiChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChatCompletionResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct CompletionEnvelope {
    suggestions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuggestionEnvelope {
    suggestions: Vec<RawSuggestionEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSuggestionEntry {
    text: String,
    kind: Option<String>,
    apply_mode: Option<String>,
}

pub(crate) fn build_client(timeout_ms: u64) -> Client {
    Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .expect("ghost completion HTTP client should build")
}

pub(crate) async fn send_openai_request(
    client: &Client,
    url: &str,
    api_key: &str,
    payload: &OpenAiChatCompletionRequest,
) -> Result<OpenAiChatCompletionResponse> {
    let response = client
        .post(url)
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

pub(crate) fn build_completion_request_payload(
    request: &CompletionRequest,
) -> OpenAiChatCompletionRequest {
    let (system_content, user_content) = build_completion_prompt_messages(request);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_content,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_content,
            },
        ],
    }
}

pub(crate) fn build_completion_prompt_messages(
    request: &CompletionRequest,
) -> (String, String) {
    let git_branch = request
        .git_branch
        .clone()
        .unwrap_or_else(|| "(none)".to_string());
    let git_status = join_limited(&request.git_status_summary, MAX_STATUS_LINES);
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);
    let cwd_dirs = join_limited(&request.cwd_summary.dirs, MAX_SUMMARY_ITEMS);
    let cwd_files = join_limited(&request.cwd_summary.files, MAX_SUMMARY_ITEMS);
    let tool_availability = join_limited(&request.tool_availability, MAX_SUMMARY_ITEMS);

    (
        [
            "You are a Linux terminal command prediction assistant.",
            "Return JSON array only.",
            "Return up to 5 executable commands.",
            "Each command must begin with the user's prefix exactly.",
            "Prefer the most likely next command based on cwd, git state, history, and available tools.",
            "Never explain, never use markdown outside the raw JSON array, and never include placeholders like <branch>.",
            "Do not suggest destructive commands or anything requiring secret values.",
        ]
        .join(" "),
        format!(
            concat!(
                "Return JSON array only.\n",
                "prefix: {}\n",
                "pwd: {}\n",
                "git_branch: {}\n",
                "git_status: {}\n",
                "recent_history: {}\n",
                "cwd_dirs: {}\n",
                "cwd_files: {}\n",
                "os: {}\n",
                "shell: {}\n",
                "package_manager: {}\n",
                "tool_availability: {}\n",
                "session_id: {}\n",
                "user_id: {}"
            ),
            request.prefix,
            request.pwd,
            git_branch,
            git_status,
            recent_history,
            cwd_dirs,
            cwd_files,
            request.system_summary.os,
            request.system_summary.shell,
            request.system_summary.package_manager,
            tool_availability,
            request.session_id,
            request.user_id,
        ),
    )
}

pub(crate) fn build_inline_suggestion_request_payload(
    request: &AiInlineSuggestionRequest,
) -> OpenAiChatCompletionRequest {
    let (system_content, user_content) = build_inline_suggestion_prompt_messages(request);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_content,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_content,
            },
        ],
    }
}

pub(crate) fn build_inline_suggestion_prompt_messages(
    request: &AiInlineSuggestionRequest,
) -> (String, String) {
    let git_branch = request
        .git_branch
        .clone()
        .unwrap_or_else(|| "(none)".to_string());
    let git_status = join_limited(&request.git_status_summary, MAX_STATUS_LINES);
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);
    let cwd_dirs = join_limited(&request.cwd_summary.dirs, MAX_SUMMARY_ITEMS);
    let cwd_files = join_limited(&request.cwd_summary.files, MAX_SUMMARY_ITEMS);
    let tool_availability = join_limited(&request.tool_availability, MAX_SUMMARY_ITEMS);

    (
        [
            "You are a Linux terminal suggestion assistant.",
            "Return JSON object only with a suggestions array.",
            "Each suggestion must contain text, kind, and applyMode.",
            "Allowed kind values: completion, correction, intent.",
            "Allowed applyMode values: append, replace.",
            "Return up to 5 safe executable commands with no explanations.",
            "Never suggest destructive commands or commands that require secret values.",
            "Prefer completion when the current draft is already correct.",
        ]
        .join(" "),
        format!(
            concat!(
                "Return JSON object only.\n",
                "draft: {}\n",
                "pwd: {}\n",
                "git_branch: {}\n",
                "git_status: {}\n",
                "recent_history: {}\n",
                "cwd_dirs: {}\n",
                "cwd_files: {}\n",
                "os: {}\n",
                "shell: {}\n",
                "package_manager: {}\n",
                "tool_availability: {}\n",
                "session_id: {}\n",
                "user_id: {}"
            ),
            request.draft,
            request.pwd,
            git_branch,
            git_status,
            recent_history,
            cwd_dirs,
            cwd_files,
            request.system_summary.os,
            request.system_summary.shell,
            request.system_summary.package_manager,
            tool_availability,
            request.session_id,
            request.user_id,
        ),
    )
}

pub(crate) fn build_recovery_suggestion_request_payload(
    request: &AiRecoverySuggestionRequest,
) -> OpenAiChatCompletionRequest {
    let (system_content, user_content) = build_recovery_suggestion_prompt_messages(request);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_content,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_content,
            },
        ],
    }
}

pub(crate) fn build_recovery_suggestion_prompt_messages(
    request: &AiRecoverySuggestionRequest,
) -> (String, String) {
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);

    (
        [
            "You are a Linux terminal recovery assistant.",
            "Return JSON object only with a suggestions array.",
            "Each suggestion must contain text, kind, and applyMode.",
            "Use kind=recovery and applyMode=replace for every suggestion.",
            "Return up to 5 safe recovery commands with no explanations.",
            "Do not repeat the failed command unless it is clearly corrected.",
            "Never suggest destructive commands or commands that require secret values.",
        ]
        .join(" "),
        format!(
            concat!(
                "Return JSON object only.\n",
                "failed_command: {}\n",
                "exit_code: {}\n",
                "output: {}\n",
                "cwd: {}\n",
                "shell: {}\n",
                "recent_history: {}\n",
                "session_id: {}\n",
                "user_id: {}"
            ),
            request.command,
            request.exit_code,
            request.output,
            request.cwd,
            request.shell,
            recent_history,
            request.session_id,
            request.user_id,
        ),
    )
}

pub(crate) fn build_connection_test_payload(model: &str) -> OpenAiChatCompletionRequest {
    let (system_content, user_content) = build_connection_test_prompt_messages();

    OpenAiChatCompletionRequest {
        model: normalize_identifier(model),
        temperature: 0.0,
        max_tokens: 12,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_content,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_content,
            },
        ],
    }
}

pub(crate) fn build_connection_test_prompt_messages() -> (String, String) {
    ("Reply with OK only.".to_string(), "ping".to_string())
}

pub(crate) fn parse_completion_candidates(
    request: &CompletionRequest,
    raw: &str,
) -> Vec<CompletionCandidate> {
    let Some(payload) = extract_json_payload(raw) else {
        return Vec::new();
    };

    let entries = serde_json::from_str::<Vec<String>>(payload)
        .ok()
        .or_else(|| {
            serde_json::from_str::<CompletionEnvelope>(payload)
                .ok()
                .map(|envelope| envelope.suggestions)
        })
        .unwrap_or_default();

    let mut seen = HashSet::new();
    let mut suggestions = Vec::new();
    for (index, entry) in entries.into_iter().enumerate() {
        let Some(text) = sanitize_candidate(&request.prefix, &entry) else {
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

        if suggestions.len() >= MAX_COMPLETION_CANDIDATES {
            break;
        }
    }

    suggestions
}

pub(crate) fn parse_inline_suggestion_items(
    request: &AiInlineSuggestionRequest,
    raw: &str,
) -> Vec<SuggestionItem> {
    let Some(entries) = parse_structured_suggestions(raw) else {
        return Vec::new();
    };

    let mut seen = HashSet::new();
    let mut suggestions = Vec::new();
    for (index, entry) in entries.into_iter().enumerate() {
        let Some(suggestion) = sanitize_inline_suggestion(&request.draft, &entry, index) else {
            continue;
        };
        if !seen.insert(format!("{:?}:{}", suggestion.group, suggestion.text)) {
            continue;
        }

        suggestions.push(suggestion);
        if suggestions.len() >= MAX_COMPLETION_CANDIDATES {
            break;
        }
    }

    suggestions
}

pub(crate) fn parse_recovery_suggestion_items(
    _request: &AiRecoverySuggestionRequest,
    raw: &str,
) -> Vec<SuggestionItem> {
    let Some(entries) = parse_structured_suggestions(raw) else {
        return Vec::new();
    };

    let mut seen = HashSet::new();
    let mut suggestions = Vec::new();
    for (index, entry) in entries.into_iter().enumerate() {
        let Some(suggestion) = sanitize_recovery_suggestion(&entry, index) else {
            continue;
        };
        if !seen.insert(suggestion.text.clone()) {
            continue;
        }

        suggestions.push(suggestion);
        if suggestions.len() >= MAX_COMPLETION_CANDIDATES {
            break;
        }
    }

    suggestions
}

pub(crate) fn sanitize_candidate(prefix: &str, candidate: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_SUGGESTION_CHARS {
        return None;
    }
    if trimmed.contains('\n') || trimmed.contains('\r') {
        return None;
    }
    if !trimmed.starts_with(prefix) || trimmed == prefix {
        return None;
    }

    let lowered = trimmed.to_ascii_lowercase();
    if DANGEROUS_PATTERNS
        .iter()
        .any(|pattern| lowered.contains(pattern))
    {
        return None;
    }

    Some(trimmed.to_string())
}

fn parse_structured_suggestions(raw: &str) -> Option<Vec<RawSuggestionEntry>> {
    let payload = extract_json_payload(raw)?;
    serde_json::from_str::<SuggestionEnvelope>(payload)
        .ok()
        .map(|envelope| envelope.suggestions)
        .or_else(|| serde_json::from_str::<Vec<RawSuggestionEntry>>(payload).ok())
}

fn sanitize_inline_suggestion(
    draft: &str,
    entry: &RawSuggestionEntry,
    index: usize,
) -> Option<SuggestionItem> {
    let text = sanitize_command_text(&entry.text)?;
    if text == draft {
        return None;
    }

    let kind = match normalize_identifier(entry.kind.as_deref().unwrap_or_default()).as_str() {
        "completion" => SuggestionKind::Completion,
        "correction" => SuggestionKind::Correction,
        "intent" => SuggestionKind::Intent,
        _ if text.starts_with(draft) => SuggestionKind::Completion,
        _ => SuggestionKind::Intent,
    };
    let apply_mode = match normalize_identifier(entry.apply_mode.as_deref().unwrap_or_default()).as_str() {
        "append" => SuggestionApplyMode::Append,
        "replace" => SuggestionApplyMode::Replace,
        _ if matches!(kind, SuggestionKind::Completion) && text.starts_with(draft) => {
            SuggestionApplyMode::Append
        }
        _ => SuggestionApplyMode::Replace,
    };

    let replacement = match apply_mode {
        SuggestionApplyMode::Append => {
            if !text.starts_with(draft) {
                return None;
            }

            let suffix = text[draft.len()..].to_string();
            if suffix.is_empty() {
                return None;
            }

            SuggestionReplacement::Append { suffix }
        }
        SuggestionApplyMode::Replace => SuggestionReplacement::ReplaceAll {
            value: text.clone(),
        },
    };

    Some(SuggestionItem {
        id: format!("ai:inline:{}", index),
        text,
        kind,
        source: CompletionCandidateSource::Ai,
        score: 900u16.saturating_sub((index as u16) * 10),
        group: SuggestionGroup::Inline,
        apply_mode,
        replacement,
    })
}

fn sanitize_recovery_suggestion(entry: &RawSuggestionEntry, index: usize) -> Option<SuggestionItem> {
    let text = sanitize_command_text(&entry.text)?;

    Some(SuggestionItem {
        id: format!("ai:recovery:{}", index),
        text: text.clone(),
        kind: SuggestionKind::Recovery,
        source: CompletionCandidateSource::Ai,
        score: 900u16.saturating_sub((index as u16) * 10),
        group: SuggestionGroup::Recovery,
        apply_mode: SuggestionApplyMode::Replace,
        replacement: SuggestionReplacement::ReplaceAll { value: text },
    })
}

fn sanitize_command_text(candidate: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_SUGGESTION_CHARS {
        return None;
    }
    if trimmed.contains('\n') || trimmed.contains('\r') {
        return None;
    }

    let lowered = trimmed.to_ascii_lowercase();
    if DANGEROUS_PATTERNS
        .iter()
        .any(|pattern| lowered.contains(pattern))
    {
        return None;
    }

    Some(trimmed.to_string())
}

pub(crate) fn classify_candidate_kind(command: &str) -> CompletionCandidateKind {
    if command.starts_with("git ") {
        return CompletionCandidateKind::Git;
    }
    if command.starts_with("docker ") {
        return CompletionCandidateKind::Docker;
    }
    if command.starts_with("ssh ") {
        return CompletionCandidateKind::Ssh;
    }
    if command.starts_with("systemctl ") {
        return CompletionCandidateKind::Systemctl;
    }
    if command.starts_with("go ") {
        return CompletionCandidateKind::Go;
    }
    if command.starts_with("apt ") || command.starts_with("yum ") || command.starts_with("brew ") {
        return CompletionCandidateKind::Package;
    }
    if command.starts_with("kubectl ") {
        return CompletionCandidateKind::Kubectl;
    }
    if command.starts_with("curl ") || command.starts_with("wget ") || command.starts_with("ping ")
    {
        return CompletionCandidateKind::Network;
    }
    if command.starts_with("cd ")
        || command.starts_with("ls ")
        || command.starts_with("cat ")
        || command.starts_with("less ")
        || command.starts_with("tail ")
    {
        return CompletionCandidateKind::Path;
    }

    CompletionCandidateKind::Command
}

fn extract_json_payload(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    if trimmed.starts_with("```") {
        let without_fence = trimmed.trim_start_matches('`');
        let after_header = without_fence.split_once('\n')?.1;
        return after_header
            .rsplit_once("```")
            .map(|(content, _)| content.trim());
    }

    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return Some(trimmed);
    }
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return Some(trimmed);
    }

    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            return Some(trimmed[start..=end].trim());
        }
    }
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            return Some(trimmed[start..=end].trim());
        }
    }

    None
}

fn join_limited(entries: &[String], limit: usize) -> String {
    if entries.is_empty() {
        return "(none)".to_string();
    }

    entries
        .iter()
        .take(limit)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ")
}

fn validate_connection_test_request(
    request: &ConnectionTestRequest,
) -> std::result::Result<(), ConnectionTestResult> {
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

pub(crate) fn normalize_identifier(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(crate) fn classify_transport_error(error: anyhow::Error) -> ConnectionTestResult {
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

#[cfg(test)]
mod tests {
    use super::{
        build_completion_request_payload, classify_http_error_message, parse_completion_candidates,
        validate_connection_test_request, CompletionCandidateSource, CompletionRequest,
        ConnectionTestRequest, ConnectionTestResult, CwdSummary, SystemSummary,
    };

    fn request(prefix: &str) -> CompletionRequest {
        CompletionRequest {
            provider: "glm".to_string(),
            model: "glm-4.7-flash".to_string(),
            api_key: "secret-key".to_string(),
            base_url: String::new(),
            prefix: prefix.to_string(),
            pwd: "/USER/project".to_string(),
            git_branch: Some("main".to_string()),
            git_status_summary: vec!["M src/main.tsx".to_string()],
            recent_history: vec!["git status".to_string(), "git add .".to_string()],
            cwd_summary: CwdSummary {
                dirs: vec!["src".to_string(), "docs".to_string()],
                files: vec!["package.json".to_string()],
            },
            system_summary: SystemSummary {
                os: "ubuntu".to_string(),
                shell: "/bin/bash".to_string(),
                package_manager: "apt".to_string(),
            },
            tool_availability: vec!["git".to_string(), "docker".to_string()],
            session_id: "sess-1".to_string(),
            user_id: "user-1".to_string(),
        }
    }

    #[test]
    fn parses_json_array_candidates_into_ai_suggestions() {
        let suggestions = parse_completion_candidates(
            &request("git c"),
            r#"```json
["git commit -m \"update\"", "git checkout dev"]
```"#,
        );

        assert_eq!(suggestions.len(), 2);
        assert_eq!(suggestions[0].text, "git commit -m \"update\"");
        assert_eq!(suggestions[0].source, CompletionCandidateSource::Ai);
    }

    #[test]
    fn builds_prompt_with_context_snapshot_and_json_contract() {
        let payload = build_completion_request_payload(&request("git c"));
        let user_message = payload
            .messages
            .iter()
            .find(|message| message.role == "user")
            .expect("user message should exist");

        assert!(user_message.content.contains("prefix: git c"));
        assert!(user_message.content.contains("pwd: /USER/project"));
        assert!(user_message.content.contains("git_branch: main"));
        assert!(user_message.content.contains("cwd_dirs: src, docs"));
        assert!(user_message.content.contains("Return JSON array only."));
    }

    #[test]
    fn filters_non_matching_or_dangerous_candidates() {
        let suggestions = parse_completion_candidates(
            &request("git c"),
            r#"["git commit -m \"ok\"", "docker logs api", "git checkout dev", "git c", "git checkout main && reboot"]"#,
        );

        assert_eq!(suggestions.len(), 2);
        assert!(suggestions
            .iter()
            .all(|candidate| candidate.text.starts_with("git c")));
    }

    #[test]
    fn validates_connection_requests_and_classifies_provider_errors() {
        let result = validate_connection_test_request(&ConnectionTestRequest {
            provider: "glm".to_string(),
            model: "".to_string(),
            api_key: "".to_string(),
            base_url: String::new(),
        });

        assert_eq!(
            result,
            Err(ConnectionTestResult {
                status: "config_error".to_string(),
                message: "API key is required".to_string(),
                latency_ms: None,
            })
        );
        assert_eq!(
            classify_http_error_message(
                r#"http:429:{"error":{"code":"1302","message":"rate limit"}}"#
            ),
            Some(ConnectionTestResult {
                status: "provider_error".to_string(),
                message: r#"{"error":{"code":"1302","message":"rate limit"}}"#.to_string(),
                latency_ms: None,
            })
        );
    }

    #[test]
    fn parses_structured_inline_suggestions() {
        let suggestions = super::parse_inline_suggestion_items(
            &super::AiInlineSuggestionRequest {
                provider: "glm".to_string(),
                model: "glm-4.7-flash".to_string(),
                api_key: "secret-key".to_string(),
                base_url: String::new(),
                draft: "git ch".to_string(),
                pwd: "/USER/project".to_string(),
                git_branch: Some("main".to_string()),
                git_status_summary: vec!["M src/main.tsx".to_string()],
                recent_history: vec!["git status".to_string()],
                cwd_summary: CwdSummary {
                    dirs: vec!["src".to_string()],
                    files: vec!["package.json".to_string()],
                },
                system_summary: SystemSummary {
                    os: "ubuntu".to_string(),
                    shell: "/bin/bash".to_string(),
                    package_manager: "apt".to_string(),
                },
                tool_availability: vec!["git".to_string()],
                session_id: "sess-1".to_string(),
                user_id: "user-1".to_string(),
            },
            r#"{"suggestions":[{"text":"git checkout main","kind":"completion","applyMode":"append"},{"text":"git status","kind":"intent","applyMode":"replace"}]}"#,
        );

        assert_eq!(suggestions.len(), 2);
        assert_eq!(suggestions[0].text, "git checkout main");
        assert_eq!(suggestions[0].group, super::SuggestionGroup::Inline);
        assert_eq!(suggestions[1].kind, super::SuggestionKind::Intent);
    }

    #[test]
    fn builds_recovery_prompt_with_failed_command_context() {
        let payload = super::build_recovery_suggestion_request_payload(&super::AiRecoverySuggestionRequest {
            provider: "glm".to_string(),
            model: "glm-4.7-flash".to_string(),
            api_key: "secret-key".to_string(),
            base_url: String::new(),
            command: "gti sttaus".to_string(),
            output: "git: 'sttaus' is not a git command".to_string(),
            exit_code: 1,
            cwd: "/workspace".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec!["git status".to_string()],
            session_id: "sess-1".to_string(),
            user_id: "user-1".to_string(),
        });

        let user_message = payload
            .messages
            .iter()
            .find(|message| message.role == "user")
            .expect("user message should exist");

        assert!(user_message.content.contains("failed_command: gti sttaus"));
        assert!(user_message.content.contains("exit_code: 1"));
        assert!(user_message.content.contains("git: 'sttaus' is not a git command"));
    }
}
