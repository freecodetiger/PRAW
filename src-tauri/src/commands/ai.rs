use crate::ai::{
    build_ai_suggestion_command_result, classify_ai_suggestion_error, complete, inline_suggestions,
    intent_suggestions, recovery_suggestions, test_connection, AiInlineSuggestionRequest,
    AiIntentSuggestionRequest, AiRecoverySuggestionRequest, AiSuggestionCommandResult,
    CompletionRequest, CompletionResponse, ConnectionTestRequest, ConnectionTestResult,
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
) -> Result<AiSuggestionCommandResult, String> {
    match inline_suggestions(request).await {
        Ok(response) => Ok(build_ai_suggestion_command_result(response)),
        Err(error) => Ok(classify_ai_suggestion_error(error)),
    }
}

#[tauri::command]
pub async fn request_ai_recovery_suggestions(
    request: AiRecoverySuggestionRequest,
) -> Result<AiSuggestionCommandResult, String> {
    match recovery_suggestions(request).await {
        Ok(response) => Ok(build_ai_suggestion_command_result(response)),
        Err(error) => Ok(classify_ai_suggestion_error(error)),
    }
}

#[tauri::command]
pub async fn request_ai_intent_suggestions(
    request: AiIntentSuggestionRequest,
) -> Result<AiSuggestionCommandResult, String> {
    match intent_suggestions(request).await {
        Ok(response) => Ok(build_ai_suggestion_command_result(response)),
        Err(error) => Ok(classify_ai_suggestion_error(error)),
    }
}

#[tauri::command]
pub async fn test_ai_connection(
    request: ConnectionTestRequest,
) -> Result<ConnectionTestResult, String> {
    Ok(test_connection(request).await)
}
