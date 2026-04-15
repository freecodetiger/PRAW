use std::path::Path;
use std::process::Command;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::agent_bridge::NormalizedAgentEvent;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAgentCapabilities {
    pub supports_resume_picker: bool,
    pub supports_direct_resume: bool,
    pub supports_review: bool,
    pub supports_model_override: bool,
    pub shows_bypass_capsule: bool,
}

pub trait StructuredProviderAdapter {
    fn provider_id(&self) -> &'static str;
    fn capabilities(&self) -> StructuredAgentCapabilities;
    fn should_fallback_to_raw(&self, passthrough_args: &[String]) -> bool {
        !passthrough_args.is_empty()
    }
    fn requires_synthetic_session_id(&self) -> bool {
        false
    }
    fn build_command(
        &self,
        cwd: &Path,
        remote_session_id: Option<&str>,
        is_resume: bool,
        prompt: &str,
        model_override: Option<&str>,
    ) -> Result<Command>;
    fn prompt_payload(&self, _prompt: &str) -> Result<Option<String>> {
        Ok(None)
    }
    fn parse_line(&self, raw: &Value) -> Vec<NormalizedAgentEvent>;
}
