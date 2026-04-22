#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use crate::terminal::agent_bridge::{
        build_raw_provider_command_for_test, run_agent_host_from_args, ProviderBridgeKind,
    };

    #[test]
    fn provider_cli_aliases_are_supported_for_raw_host() {
        assert_eq!(
            ProviderBridgeKind::from_cli_name("codex"),
            Some(ProviderBridgeKind::Codex)
        );
        assert_eq!(
            ProviderBridgeKind::from_cli_name("omx"),
            Some(ProviderBridgeKind::Omx)
        );
        assert_eq!(
            ProviderBridgeKind::from_cli_name("claude"),
            Some(ProviderBridgeKind::Claude)
        );
        assert_eq!(
            ProviderBridgeKind::from_cli_name("qwen"),
            Some(ProviderBridgeKind::Qwen)
        );
        assert_eq!(
            ProviderBridgeKind::from_cli_name("qwen-code"),
            Some(ProviderBridgeKind::Qwen)
        );
        assert_eq!(ProviderBridgeKind::from_cli_name("unknown"), None);
    }

    #[test]
    fn returns_false_when_not_invoked_in_agent_host_mode() {
        let args = vec!["codex".to_string(), "exec".to_string(), "status".to_string()];
        let handled = run_agent_host_from_args(&args).expect("non-host invocation should be ignored");
        assert!(!handled);
    }

    #[test]
    fn builds_raw_provider_command_with_cwd_and_passthrough_args() {
        let command = build_raw_provider_command_for_test(
            ProviderBridgeKind::Qwen,
            std::path::Path::new("/workspace/project"),
            &["code".to_string(), "--model".to_string(), "qwen3".to_string()],
        );

        assert_eq!(command.get_program().to_string_lossy(), "qwen");
        assert_eq!(
            command
                .get_current_dir()
                .expect("current dir should be set")
                .to_string_lossy(),
            "/workspace/project"
        );

        let args: Vec<String> = command
            .get_args()
            .map(|value: &std::ffi::OsStr| value.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args, vec!["code", "--model", "qwen3"]);
    }

    #[test]
    fn builds_omx_provider_command_with_omx_binary() {
        let command = build_raw_provider_command_for_test(
            ProviderBridgeKind::Omx,
            std::path::Path::new("/workspace/project"),
            &[],
        );

        assert_eq!(command.get_program().to_string_lossy(), "omx");
    }

    #[test]
    fn launcher_source_is_raw_only_and_has_no_structured_bridge_markers() {
        let source = fs::read_to_string(agent_bridge_source_path())
            .expect("agent_bridge.rs should be readable in tests");

        assert!(source.contains("--praw-agent-host"));
        assert!(source.contains("--session-id"));
        assert!(source.contains("--cwd"));
        assert!(source.contains("trailing_args"));

        let forbidden_markers = [
            "PRAW_AGENT_SOCKET",
            "AgentBridgeRegistry",
            "TerminalAgentEvent",
            "TerminalAgentMode",
            "TerminalAgentState",
            "structured_runtime",
            "run_structured_agent_host",
            "emit_bridge_event",
            "send_bridge_event",
            "AgentControlMessage",
            "UnixListener",
            "UnixStream",
        ];

        for marker in forbidden_markers {
            assert!(
                !source.contains(marker),
                "raw-only launcher must not contain structured marker: {marker}"
            );
        }
    }

    fn agent_bridge_source_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("terminal")
            .join("agent_bridge.rs")
    }
}
