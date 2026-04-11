#![allow(dead_code)]

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub provider: String,
    pub model: String,
    pub shell: String,
    pub os: String,
    pub cwd: String,
    pub input_prefix: String,
    pub recent_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub suggestion: String,
    pub replace_range: Option<(usize, usize)>,
    pub latency_ms: u64,
}

pub trait AiProvider: Send + Sync {
    fn complete(&self, request: CompletionRequest) -> Result<CompletionResponse>;
}

pub struct GlmProvider;

impl AiProvider for GlmProvider {
    fn complete(&self, _request: CompletionRequest) -> Result<CompletionResponse> {
        anyhow::bail!("GLM provider is scaffolded but not implemented in phase 1");
    }
}
