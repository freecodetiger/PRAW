use crate::ai::{
    complete, test_connection, CompletionRequest, CompletionResponse, ConnectionTestRequest,
    ConnectionTestResult,
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
pub async fn test_ai_connection(
    request: ConnectionTestRequest,
) -> Result<ConnectionTestResult, String> {
    Ok(test_connection(request).await)
}
