use tauri::{AppHandle, State};

use crate::{
    app_state::AppState,
    voice::{StartVoiceTranscriptionRequest, StartVoiceTranscriptionResponse},
};

#[tauri::command]
pub fn start_voice_transcription(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StartVoiceTranscriptionRequest,
) -> Result<StartVoiceTranscriptionResponse, String> {
    state
        .voice_manager
        .start_session(app, request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stop_voice_transcription(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .voice_manager
        .stop_session(&session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cancel_voice_transcription(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .voice_manager
        .cancel_session(&session_id)
        .map_err(|error| error.to_string())
}
