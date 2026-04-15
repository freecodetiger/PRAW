#[cfg(test)]
mod tests {
    use crate::terminal::structured_provider::StructuredAgentCapabilities;

    #[test]
    fn bridge_state_includes_runtime_capabilities() {
        let capabilities = StructuredAgentCapabilities {
            supports_resume_picker: true,
            supports_direct_resume: false,
            supports_review: true,
            supports_model_override: true,
            shows_bypass_capsule: true,
        };

        assert!(capabilities.shows_bypass_capsule);
        assert!(capabilities.supports_review);
    }
}
