use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;

use crate::ai::provider::{AiProvider, ProviderDescriptor};
use crate::ai::providers::openai_compatible::{
    complete_with_openai_compatible, suggest_inline_with_openai_compatible,
    suggest_recovery_with_openai_compatible, test_connection_with_openai_compatible,
    OpenAiCompatibleDescriptor,
};
use crate::ai::types::{
    AiInlineSuggestionRequest, AiRecoverySuggestionRequest, CompletionRequest, CompletionResponse,
    ConnectionTestRequest, ConnectionTestResult, SuggestionResponse,
};
use crate::ai::{build_client, COMPLETION_REQUEST_TIMEOUT_MS, CONNECTION_TEST_TIMEOUT_MS};

pub struct QwenProvider {
    completion_client: Client,
    connection_test_client: Client,
}

impl Default for QwenProvider {
    fn default() -> Self {
        Self {
            completion_client: build_client(COMPLETION_REQUEST_TIMEOUT_MS),
            connection_test_client: build_client(CONNECTION_TEST_TIMEOUT_MS),
        }
    }
}

impl QwenProvider {
    fn openai_compatible_descriptor(&self) -> OpenAiCompatibleDescriptor {
        OpenAiCompatibleDescriptor {
            id: "qwen",
            label: "Qwen",
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        }
    }
}

#[async_trait]
impl AiProvider for QwenProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "qwen",
            label: "Qwen",
            default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
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

    async fn test_connection(&self, request: ConnectionTestRequest) -> ConnectionTestResult {
        test_connection_with_openai_compatible(
            &self.openai_compatible_descriptor(),
            &self.connection_test_client,
            request,
        )
        .await
    }
}
