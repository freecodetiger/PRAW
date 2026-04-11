use serde::Serialize;

pub const TERMINAL_OUTPUT_EVENT: &str = "terminal/output";
pub const TERMINAL_EXIT_EVENT: &str = "terminal/exit";

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
