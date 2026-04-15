#[cfg(test)]
mod tests {
    use crate::terminal::agent_bridge::{
        NormalizedAgentEvent, ProviderBridgeKind,
    };
    use crate::terminal::structured_codex::build_codex_command_for_test;
    use crate::terminal::structured_qwen::qwen_adapter_for_test;
    use crate::terminal::structured_runtime::parse_provider_stream_line;
    use crate::terminal::StructuredProviderAdapter;

    #[test]
    fn parses_codex_agent_messages_without_command_noise() {
        let events = parse_provider_stream_line(
            ProviderBridgeKind::Codex,
            r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"pong"}}"#,
        )
        .expect("codex line should parse");

        assert_eq!(
            events,
            vec![NormalizedAgentEvent::AssistantMessage {
                text: "pong".to_string()
            }]
        );
    }

    #[test]
    fn ignores_qwen_structured_lines_once_qwen_defaults_to_raw_fallback() {
        let thinking = parse_provider_stream_line(
            ProviderBridgeKind::Qwen,
            r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"hidden"}]}}"#,
        )
        .expect("qwen thinking line should parse");
        let text = parse_provider_stream_line(
            ProviderBridgeKind::Qwen,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"pong"}]}}"#,
        )
        .expect("qwen text line should parse");

        assert!(thinking.is_empty());
        assert!(text.is_empty());
    }

    #[test]
    fn parses_claude_result_errors_as_agent_errors() {
        let events = parse_provider_stream_line(
            ProviderBridgeKind::Claude,
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}"#,
        )
        .expect("claude result line should parse");

        assert_eq!(
            events,
            vec![NormalizedAgentEvent::Error {
                message: "Not logged in · Please run /login".to_string()
            }]
        );
    }

    #[test]
    fn codex_resume_command_keeps_remote_session_and_model_override() {
        let command = build_codex_command_for_test(
            std::path::Path::new("/workspace"),
            Some("codex-session-1"),
            "continue",
            Some("gpt-5.4"),
        )
        .expect("codex resume command should build");
        let args: Vec<String> = command
            .get_args()
            .map(|value: &std::ffi::OsStr| value.to_string_lossy().into_owned())
            .collect();

        assert_eq!(
            args,
            vec![
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                "--model",
                "gpt-5.4",
                "codex-session-1",
                "continue",
            ]
        );
    }

    #[test]
    fn codex_new_turn_command_uses_model_override_without_resume() {
        let command = build_codex_command_for_test(
            std::path::Path::new("/workspace"),
            None,
            "start fresh",
            Some("gpt-5.4"),
        )
        .expect("codex new turn command should build");
        let args: Vec<String> = command
            .get_args()
            .map(|value: &std::ffi::OsStr| value.to_string_lossy().into_owned())
            .collect();

        assert_eq!(
            args,
            vec![
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--sandbox",
                "danger-full-access",
                "--model",
                "gpt-5.4",
                "start fresh",
            ]
        );
    }

    #[test]
    fn qwen_structured_command_builds_are_disabled_in_favor_of_raw_fallback() {
        let error = qwen_adapter_for_test()
            .build_command(
                std::path::Path::new("/workspace"),
                Some("generated-session-1"),
                false,
                "ignored",
                Some("qwen3-coder-plus"),
            )
            .expect_err("qwen structured command should be disabled");

        assert!(error.to_string().contains("raw fallback"));
    }

    #[test]
    fn qwen_adapter_requests_raw_fallback_even_for_plain_invocation() {
        assert!(qwen_adapter_for_test().should_fallback_to_raw(&[]));
    }
}
