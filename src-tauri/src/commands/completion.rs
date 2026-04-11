use crate::completion::{complete_local, LocalCompletionRequest, LocalCompletionResponse};

#[tauri::command]
pub fn request_local_completion(
    request: LocalCompletionRequest,
) -> Result<Option<LocalCompletionResponse>, String> {
    complete_local(request).map_err(|error| error.to_string())
}
