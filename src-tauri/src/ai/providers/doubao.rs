use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;

use crate::ai::provider::{AiProvider, ProviderDescriptor};
use crate::ai::providers::openai_compatible::{
    complete_with_openai_compatible, suggest_inline_with_openai_compatible,
    suggest_intent_with_openai_compatible, suggest_recovery_with_openai_compatible,
    test_connection_with_openai_compatible, OpenAiCompatibleDescriptor,
};
use crate::ai::types::{
    AiInlineSuggestionRequest, AiIntentSuggestionRequest, AiRecoverySuggestionRequest,
    CompletionRequest, CompletionResponse, ConnectionTestRequest, ConnectionTestResult,
    SuggestionResponse,
};
use crate::ai::{build_client, COMPLETION_REQUEST_TIMEOUT_MS, CONNECTION_TEST_TIMEOUT_MS};

pub struct DoubaoProvider {
    completion_client: Client,
    connection_test_client: Client,
}

impl Default for DoubaoProvider {
    fn default() -> Self {
        Self {
            completion_client: build_client(COMPLETION_REQUEST_TIMEOUT_MS),
            connection_test_client: build_client(CONNECTION_TEST_TIMEOUT_MS),
        }
    }
}

impl DoubaoProvider {
    fn openai_compatible_descriptor(&self) -> OpenAiCompatibleDescriptor {
        OpenAiCompatibleDescriptor {
            id: "doubao",
            label: "Doubao",
            base_url: "https://ark.cn-beijing.volces.com/api/v3",
        }
    }
}

#[async_trait]
impl AiProvider for DoubaoProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "doubao",
            label: "Doubao",
            default_base_url: "https://ark.cn-beijing.volces.com/api/v3",
        }
    }

    async fn complete(&self, request: CompletionRequest) -> Result<Option<CompletionResponse>> {
        complete_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.completion_client,
            request,
        )
        .await
    }

    async fn suggest_inline(
        &self,
        request: AiInlineSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        suggest_inline_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.completion_client,
            request,
        )
        .await
    }

    async fn suggest_recovery(
        &self,
        request: AiRecoverySuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        suggest_recovery_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.completion_client,
            request,
        )
        .await
    }

    async fn suggest_intent(
        &self,
        request: AiIntentSuggestionRequest,
    ) -> Result<Option<SuggestionResponse>> {
        suggest_intent_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.completion_client,
            request,
        )
        .await
    }

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        test_connection_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.connection_test_client,
            request,
        )
        .await
    }
}
