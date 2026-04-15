#[cfg(test)]
mod tests {
    use crate::terminal::agent_bridge::{
        build_codex_command_for_test, parse_provider_stream_line, NormalizedAgentEvent, ProviderBridgeKind,
    };

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
    fn parses_qwen_text_messages_and_drops_thinking_chunks() {
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
        assert_eq!(
            text,
            vec![NormalizedAgentEvent::AssistantMessage {
                text: "pong".to_string()
            }]
        );
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
        );
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
        );
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
}
