use std::collections::HashMap;
use std::process::Command;

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::app_state::AppState;
use crate::terminal::{list_codex_sessions as list_terminal_codex_sessions, CodexSessionSummary};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionRequest {
    pub session_id: String,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[tauri::command]
pub fn create_terminal_session(
    app: AppHandle,
    state: State<'_, AppState>,
    request: CreateTerminalSessionRequest,
) -> Result<crate::events::CreateTerminalSessionResponse, String> {
    state
        .terminal_manager
        .create_session(app, request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_terminal_session(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state
        .terminal_manager
        .write(&session_id, &data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_terminal_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .terminal_manager
        .resize(&session_id, cols, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn close_terminal_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .terminal_manager
        .close(&session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn submit_terminal_agent_prompt(
    state: State<'_, AppState>,
    session_id: String,
    prompt: String,
) -> Result<(), String> {
    state
        .terminal_manager
        .submit_agent_prompt(&session_id, &prompt)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reset_terminal_agent_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .terminal_manager
        .reset_agent_session(&session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn attach_terminal_agent_session(
    state: State<'_, AppState>,
    session_id: String,
    remote_session_id: String,
) -> Result<(), String> {
    state
        .terminal_manager
        .attach_agent_session(&session_id, &remote_session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_terminal_agent_model(
    state: State<'_, AppState>,
    session_id: String,
    model: Option<String>,
) -> Result<(), String> {
    state
        .terminal_manager
        .set_agent_model(&session_id, model.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_codex_sessions() -> Result<Vec<CodexSessionSummary>, String> {
    list_terminal_codex_sessions(30).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_terminal_agent_review(cwd: String, prompt: Option<String>) -> Result<String, String> {
    let mut command = Command::new("codex");
    command.arg("review").current_dir(cwd);
    if let Some(prompt) = prompt.filter(|value| !value.trim().is_empty()) {
        command.arg(prompt);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        if !stdout.is_empty() {
            return Ok(stdout);
        }
        if !stderr.is_empty() {
            return Ok(stderr);
        }
        return Ok("Codex review finished with no output.".to_string());
    }

    Err(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("codex review failed with status {}", output.status)
    })
}
