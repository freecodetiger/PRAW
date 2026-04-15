#[cfg(test)]
mod tests {
    use crate::terminal::structured_codex::CodexAdapter;
    use crate::terminal::structured_qwen::QwenAdapter;
    use crate::terminal::structured_provider::StructuredAgentCapabilities;
    use crate::terminal::StructuredProviderAdapter;

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

    #[test]
    fn codex_adapter_exposes_capsule_and_review_capabilities() {
        let adapter = CodexAdapter::new();
        let capabilities = adapter.capabilities();

        assert!(capabilities.shows_bypass_capsule);
        assert!(capabilities.supports_review);
        assert!(capabilities.supports_resume_picker);
    }

    #[test]
    fn qwen_adapter_exposes_capsule_capabilities_for_raw_fallback_mode() {
        let adapter = QwenAdapter::new();
        let capabilities = adapter.capabilities();

        assert!(capabilities.shows_bypass_capsule);
        assert!(!capabilities.supports_model_override);
        assert!(!capabilities.supports_direct_resume);
    }

    #[test]
    fn qwen_adapter_requests_raw_fallback_for_passthrough_commands() {
        let result = QwenAdapter::new().should_fallback_to_raw(&["auth".to_string()]);
        assert!(result);
    }

    #[test]
    fn qwen_adapter_defaults_to_raw_fallback_even_without_passthrough_commands() {
        let result = QwenAdapter::new().should_fallback_to_raw(&[]);
        assert!(result);
    }

    #[test]
    fn qwen_runtime_no_longer_exposes_legacy_stream_json_bridge_helpers() {
        let source = std::fs::read_to_string("src/terminal/agent_bridge.rs")
            .expect("agent_bridge source should be readable");

        assert!(!source.contains("build_qwen_command_for_test"));
        assert!(!source.contains("parse_qwen_line"));
        assert!(!source.contains("qwen_prompt_payload"));
    }
}
