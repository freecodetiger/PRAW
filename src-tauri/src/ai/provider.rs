use anyhow::Result;
use async_trait::async_trait;

use super::types::{
    AiInlineSuggestionRequest, AiIntentSuggestionRequest, AiRecoverySuggestionRequest,
    CompletionRequest, CompletionResponse, ConnectionTestRequest, ConnectionTestResult,
    SuggestionResponse,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub label: &'static str,
    pub default_base_url: &'static str,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;

    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>>;

    async fn suggest_inline(
        &self,
        request: AiInlineSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>>;

    async fn suggest_recovery(
        &self,
        request: AiRecoverySuggestionRequest,
    ) -> Result<Option<SuggestionResponse>>;

    async fn suggest_intent(
        &self,
        request: AiIntentSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>>;

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult;
}
