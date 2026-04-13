use crate::ai::{
    complete, inline_suggestions, recovery_suggestions, test_connection,
    AiInlineSuggestionRequest, AiRecoverySuggestionRequest, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, SuggestionResponse,
};

#[tauri::command]
pub async fn request_completion(
    request: CompletionRequest,
) -> Result<Option<CompletionResponse>, String> {
    match complete(request).await {
        Ok(response) => Ok(response),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn request_ai_inline_suggestions(
    request: AiInlineSuggestionRequest,
) -> Result<Option<SuggestionResponse>, String> {
    match inline_suggestions(request).await {
        Ok(response) => Ok(response),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn request_ai_recovery_suggestions(
    request: AiRecoverySuggestionRequest,
) -> Result<Option<SuggestionResponse>, String> {
    match recovery_suggestions(request).await {
        Ok(response) => Ok(response),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn test_ai_connection(
    request: ConnectionTestRequest,
) -> Result<ConnectionTestResult, String> {
    Ok(test_connection(request).await)
}
