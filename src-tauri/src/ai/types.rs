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
    Database,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiIntentSuggestionRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    pub draft: String,
    pub context_pack: AiCompletionContextPack,
    pub session_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionContextPack {
    pub input_mode: String,
    pub cwd: String,
    pub shell: String,
    pub recent_commands: Vec<String>,
    pub recent_successes: Vec<String>,
    pub recent_failures: Vec<AiFailureContext>,
    pub frequent_commands_in_cwd: Vec<String>,
    pub project_profile: AiProjectProfileContext,
    pub local_candidates: Vec<String>,
    pub user_preference_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFailureContext {
    pub command: String,
    pub exit_code: i32,
    pub output_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProjectProfileContext {
    #[serde(rename = "type")]
    pub project_type: String,
    pub scripts: Vec<String>,
    pub package_manager: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionGroup {
    Inline,
    Intent,
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
    pub reason: Option<String>,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionResponse {
    pub suggestions: Vec<SuggestionItem>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiSuggestionCommandStatus {
    Success,
    Empty,
    Timeout,
    AuthError,
    NetworkError,
    ProviderError,
    ParseError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestionCommandResult {
    pub status: AiSuggestionCommandStatus,
    pub suggestions: Vec<SuggestionItem>,
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
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
