use serde::Serialize;

pub const TERMINAL_OUTPUT_EVENT: &str = "terminal/output";
pub const TERMINAL_EXIT_EVENT: &str = "terminal/exit";
pub const TERMINAL_SEMANTIC_EVENT: &str = "terminal/semantic";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionResponse {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[allow(dead_code)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSemanticKind {
    Interactive,
    ClassicRequired,
    AgentWorkflow,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[allow(dead_code)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSemanticReason {
    AlternateScreen,
    MouseMode,
    FullScreenCursorControl,
    ShellEntry,
    ManualEscalation,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSemanticConfidence {
    Strong,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSemanticEvent {
    pub session_id: String,
    pub kind: TerminalSemanticKind,
    pub reason: TerminalSemanticReason,
    pub confidence: TerminalSemanticConfidence,
    pub command_entry: Option<String>,
}
