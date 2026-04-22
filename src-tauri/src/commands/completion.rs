use anyhow::Context;
use tauri::{AppHandle, Manager};

use crate::completion::{
    complete_local, complete_local_with_learning, completion_acceptance_record_from_request,
    completion_command_record_from_request, CompletionCommandExecutionRequest,
    CompletionSuggestionAcceptanceRequest, LocalCompletionRequest,
    LocalCompletionResponse,
};
use crate::completion::learning_store::CompletionLearningStore;

const COMPLETION_DB_PATH: &str = "completion/learning.sqlite3";

#[tauri::command]
pub fn request_local_completion(
    app: AppHandle,
    request: LocalCompletionRequest,
) -> Result<Option<LocalCompletionResponse>, String> {
    match completion_learning_store(&app) {
        Ok(learning_store) => {
            complete_local_with_learning(request, Some(&learning_store)).map_err(|error| error.to_string())
        }
        Err(_) => complete_local(request).map_err(|error| error.to_string()),
    }
}

#[tauri::command]
pub fn record_completion_command_execution(
    app: AppHandle,
    request: CompletionCommandExecutionRequest,
) -> Result<(), String> {
    let learning_store = completion_learning_store(&app).map_err(|error| error.to_string())?;
    learning_store
        .record_command_execution(&completion_command_record_from_request(request))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_completion_suggestion_acceptance(
    app: AppHandle,
    request: CompletionSuggestionAcceptanceRequest,
) -> Result<(), String> {
    let learning_store = completion_learning_store(&app).map_err(|error| error.to_string())?;
    learning_store
        .record_suggestion_acceptance(&completion_acceptance_record_from_request(request))
        .map_err(|error| error.to_string())
}

fn completion_learning_store(app: &AppHandle) -> anyhow::Result<CompletionLearningStore> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("failed to resolve app config directory")?;
    CompletionLearningStore::new(config_dir.join(COMPLETION_DB_PATH))
}
