use std::collections::HashMap;

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::app_state::AppState;

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
