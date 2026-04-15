#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use uuid::Uuid;

    use crate::terminal::list_codex_sessions_from_paths;

    #[test]
    fn lists_recent_codex_sessions_and_enriches_latest_prompt() {
        let fixture_root = std::env::temp_dir().join(format!("praw-codex-sessions-{}", Uuid::new_v4()));
        let sessions_root = fixture_root.join("sessions");
        let nested_dir = sessions_root.join("2026/04/15");
        let history_path = fixture_root.join("history.jsonl");

        fs::create_dir_all(&nested_dir).expect("fixture session directory should be created");
        fs::write(
            nested_dir.join("session-a.jsonl"),
            concat!(
                "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-a\",\"timestamp\":\"2026-04-15T02:03:04.000Z\",\"cwd\":\"/workspace/a\",\"source\":\"cli\",\"model_provider\":\"openai\",\"cli_version\":\"1.2.3\"}}\n",
                "{\"type\":\"ignored\"}\n",
            ),
        )
        .expect("fixture session file should be written");
        fs::write(
            &history_path,
            concat!(
                "{\"session_id\":\"session-a\",\"ts\":1,\"text\":\"first prompt\"}\n",
                "{\"session_id\":\"session-a\",\"ts\":2,\"text\":\"latest prompt\"}\n",
            ),
        )
        .expect("fixture history file should be written");

        let sessions = list_codex_sessions_from_paths(&sessions_root, &history_path, 20)
            .expect("session discovery should succeed");

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "session-a");
        assert_eq!(sessions[0].cwd, "/workspace/a");
        assert_eq!(sessions[0].latest_prompt.as_deref(), Some("latest prompt"));
        assert_eq!(sessions[0].model_provider.as_deref(), Some("openai"));

        remove_fixture_tree(fixture_root);
    }

    fn remove_fixture_tree(path: PathBuf) {
        if path.exists() {
            fs::remove_dir_all(path).expect("fixture tree should be removed");
        }
    }
}
