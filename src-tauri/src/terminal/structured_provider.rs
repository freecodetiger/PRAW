use serde::{Deserialize, Serialize};

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
}
