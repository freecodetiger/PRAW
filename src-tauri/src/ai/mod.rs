#![allow(dead_code)]

use std::collections::HashSet;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::{Client, Error as ReqwestError, StatusCode};
use serde::{Deserialize, Serialize};

const GLM_CHAT_COMPLETIONS_URL: &str = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const COMPLETION_REQUEST_TIMEOUT_MS: u64 = 1_500;
const CONNECTION_TEST_TIMEOUT_MS: u64 = 8_000;
const MAX_RECENT_COMMANDS: usize = 8;
const MAX_STATUS_LINES: usize = 8;
const MAX_SUMMARY_ITEMS: usize = 8;
const MAX_SUGGESTION_CHARS: usize = 160;
const COMPLETION_TEMPERATURE: f32 = 0.1;
const COMPLETION_MAX_TOKENS: u16 = 160;
const MAX_COMPLETION_CANDIDATES: usize = 5;
const DANGEROUS_PATTERNS: &[&str] = &["rm -rf /", "mkfs", "shutdown", "reboot", "dd if="];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CwdSummary {
    pub dirs: Vec<String>,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSummary {
    pub os: String,
    pub shell: String,
    pub package_manager: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompletionCandidateSource {
    Local,
    Ai,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompletionCandidateKind {
    Command,
    History,
    Path,
    Git,
    Docker,
    Ssh,
    Systemctl,
    Go,
    Package,
    Kubectl,
    Network,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionCandidate {
    pub text: String,
    pub source: CompletionCandidateSource,
    pub score: u16,
    pub kind: CompletionCandidateKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub prefix: String,
    pub pwd: String,
    pub git_branch: Option<String>,
    pub git_status_summary: Vec<String>,
    pub recent_history: Vec<String>,
    pub cwd_summary: CwdSummary,
    pub system_summary: SystemSummary,
    pub tool_availability: Vec<String>,
    pub session_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub suggestions: Vec<CompletionCandidate>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiInlineSuggestionRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub draft: String,
    pub pwd: String,
    pub git_branch: Option<String>,
    pub git_status_summary: Vec<String>,
    pub recent_history: Vec<String>,
    pub cwd_summary: CwdSummary,
    pub system_summary: SystemSummary,
    pub tool_availability: Vec<String>,
    pub session_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRecoverySuggestionRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub command: String,
    pub output: String,
    pub exit_code: i32,
    pub cwd: String,
    pub shell: String,
    pub recent_history: Vec<String>,
    pub session_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionGroup {
    Inline,
    Recovery,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionKind {
    Completion,
    Correction,
    Intent,
    Recovery,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionApplyMode {
    Append,
    Replace,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SuggestionReplacement {
    Append { suffix: String },
    ReplaceAll { value: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionItem {
    pub id: String,
    pub text: String,
    pub kind: SuggestionKind,
    pub source: CompletionCandidateSource,
    pub score: u16,
    pub group: SuggestionGroup,
    pub apply_mode: SuggestionApplyMode,
    pub replacement: SuggestionReplacement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionResponse {
    pub suggestions: Vec<SuggestionItem>,
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

pub async fn inline_suggestions(
    request: AiInlineSuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    match normalize_identifier(&request.provider).as_str() {
        "glm" => GlmProvider::default().suggest_inline(request).await,
        _ => Ok(None),
    }
}

pub async fn recovery_suggestions(
    request: AiRecoverySuggestionRequest,
) -> Result<Option<SuggestionResponse>> {
    match normalize_identifier(&request.provider).as_str() {
        "glm" => GlmProvider::default().suggest_recovery(request).await,
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
        let payload = send_openai_request(
            &self.completion_client,
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
        let payload = send_openai_request(
            &self.completion_client,
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
}

#[async_trait]
impl AiProvider for GlmProvider {
    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>> {
        if request.api_key.trim().is_empty()
            || request.model.trim().is_empty()
            || request.prefix.trim().is_empty()
        {
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

        let suggestions = parse_completion_candidates(&request, &content);
        if suggestions.is_empty() {
            return Ok(None);
        }

        Ok(Some(CompletionResponse {
            suggestions,
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
    let git_branch = request
        .git_branch
        .clone()
        .unwrap_or_else(|| "(none)".to_string());
    let git_status = join_limited(&request.git_status_summary, MAX_STATUS_LINES);
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);
    let cwd_dirs = join_limited(&request.cwd_summary.dirs, MAX_SUMMARY_ITEMS);
    let cwd_files = join_limited(&request.cwd_summary.files, MAX_SUMMARY_ITEMS);
    let tool_availability = join_limited(&request.tool_availability, MAX_SUMMARY_ITEMS);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: [
                    "You are a Linux terminal command prediction assistant.",
                    "Return JSON array only.",
                    "Return up to 5 executable commands.",
                    "Each command must begin with the user's prefix exactly.",
                    "Prefer the most likely next command based on cwd, git state, history, and available tools.",
                    "Never explain, never use markdown outside the raw JSON array, and never include placeholders like <branch>.",
                    "Do not suggest destructive commands or anything requiring secret values.",
                ]
                .join(" "),
            },
            OpenAiChatMessage {
                role: "user",
                content: format!(
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
            },
        ],
    }
}

fn build_inline_suggestion_request_payload(
    request: &AiInlineSuggestionRequest,
) -> OpenAiChatCompletionRequest {
    let git_branch = request
        .git_branch
        .clone()
        .unwrap_or_else(|| "(none)".to_string());
    let git_status = join_limited(&request.git_status_summary, MAX_STATUS_LINES);
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);
    let cwd_dirs = join_limited(&request.cwd_summary.dirs, MAX_SUMMARY_ITEMS);
    let cwd_files = join_limited(&request.cwd_summary.files, MAX_SUMMARY_ITEMS);
    let tool_availability = join_limited(&request.tool_availability, MAX_SUMMARY_ITEMS);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: [
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
            },
            OpenAiChatMessage {
                role: "user",
                content: format!(
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
            },
        ],
    }
}

fn build_recovery_suggestion_request_payload(
    request: &AiRecoverySuggestionRequest,
) -> OpenAiChatCompletionRequest {
    let recent_history = join_limited(&request.recent_history, MAX_RECENT_COMMANDS);

    OpenAiChatCompletionRequest {
        model: normalize_identifier(&request.model),
        temperature: COMPLETION_TEMPERATURE,
        max_tokens: COMPLETION_MAX_TOKENS,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: [
                    "You are a Linux terminal recovery assistant.",
                    "Return JSON object only with a suggestions array.",
                    "Each suggestion must contain text, kind, and applyMode.",
                    "Use kind=recovery and applyMode=replace for every suggestion.",
                    "Return up to 5 safe recovery commands with no explanations.",
                    "Do not repeat the failed command unless it is clearly corrected.",
                    "Never suggest destructive commands or commands that require secret values.",
                ]
                .join(" "),
            },
            OpenAiChatMessage {
                role: "user",
                content: format!(
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

fn parse_completion_candidates(request: &CompletionRequest, raw: &str) -> Vec<CompletionCandidate> {
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

fn parse_inline_suggestion_items(
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

fn parse_recovery_suggestion_items(
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

fn sanitize_candidate(prefix: &str, candidate: &str) -> Option<String> {
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

fn classify_candidate_kind(command: &str) -> CompletionCandidateKind {
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
