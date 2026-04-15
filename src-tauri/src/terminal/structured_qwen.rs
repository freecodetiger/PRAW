use std::path::Path;
use std::process::Command;

use anyhow::{bail, Result};
use serde_json::Value;

use super::agent_bridge::NormalizedAgentEvent;
use super::structured_provider::{StructuredAgentCapabilities, StructuredProviderAdapter};

pub struct QwenAdapter;

impl QwenAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl StructuredProviderAdapter for QwenAdapter {
    fn provider_id(&self) -> &'static str {
        "qwen"
    }

    fn capabilities(&self) -> StructuredAgentCapabilities {
        StructuredAgentCapabilities {
            supports_resume_picker: false,
            supports_direct_resume: false,
            supports_review: false,
            supports_model_override: false,
            shows_bypass_capsule: true,
        }
    }

    fn should_fallback_to_raw(&self, _passthrough_args: &[String]) -> bool {
        true
    }

    fn build_command(
        &self,
        cwd: &Path,
        remote_session_id: Option<&str>,
        is_resume: bool,
        _prompt: &str,
        model_override: Option<&str>,
    ) -> Result<Command> {
        let _ = (cwd, remote_session_id, is_resume, model_override);
        bail!("qwen structured runtime is disabled; use raw fallback")
    }

    fn parse_line(&self, raw: &Value) -> Vec<NormalizedAgentEvent> {
        let _ = raw;
        vec![]
    }
}

#[cfg(test)]
pub(crate) fn qwen_adapter_for_test() -> QwenAdapter {
    QwenAdapter::new()
}
