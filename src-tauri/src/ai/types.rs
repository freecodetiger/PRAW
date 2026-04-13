use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub base_url: String,
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
    #[serde(default)]
    pub base_url: String,
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
    #[serde(default)]
    pub base_url: String,
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
    #[serde(default)]
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub status: String,
    pub message: String,
    pub latency_ms: Option<u64>,
}
