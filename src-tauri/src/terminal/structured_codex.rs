use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::Result;
use serde_json::Value;

use super::agent_bridge::NormalizedAgentEvent;
use super::structured_provider::{StructuredAgentCapabilities, StructuredProviderAdapter};

pub struct CodexAdapter;

impl CodexAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl StructuredProviderAdapter for CodexAdapter {
    fn provider_id(&self) -> &'static str {
        "codex"
    }

    fn capabilities(&self) -> StructuredAgentCapabilities {
        StructuredAgentCapabilities {
            supports_resume_picker: true,
            supports_direct_resume: false,
            supports_review: true,
            supports_model_override: true,
            shows_bypass_capsule: true,
        }
    }

    fn build_command(
        &self,
        cwd: &Path,
        remote_session_id: Option<&str>,
        _is_resume: bool,
        prompt: &str,
        model_override: Option<&str>,
    ) -> Result<Command> {
        let mut command = Command::new(self.provider_id());
        command.current_dir(cwd);
        if let Some(session_id) = remote_session_id {
            command.args(["exec", "resume", "--json", "--skip-git-repo-check"]);
            if let Some(model) = model_override {
                command.args(["--model", model]);
            }
            command.args([session_id, prompt]);
        } else {
            command.args(["exec", "--json", "--skip-git-repo-check", "--sandbox", "danger-full-access"]);
            if let Some(model) = model_override {
                command.args(["--model", model]);
            }
            command.arg(prompt);
        }
        command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        Ok(command)
    }

    fn parse_line(&self, raw: &Value) -> Vec<NormalizedAgentEvent> {
        parse_codex_line(raw)
    }
}

fn parse_codex_line(raw: &Value) -> Vec<NormalizedAgentEvent> {
    let Some(kind) = raw.get("type").and_then(Value::as_str) else {
        return vec![];
    };

    match kind {
        "thread.started" => raw
            .get("thread_id")
            .and_then(Value::as_str)
            .map(|id| {
                vec![NormalizedAgentEvent::RemoteSession {
                    id: id.to_string(),
                }]
            })
            .unwrap_or_default(),
        "item.completed" => {
            let item = raw.get("item");
            if item
                .and_then(|value| value.get("type"))
                .and_then(Value::as_str)
                != Some("agent_message")
            {
                return vec![];
            }

            item.and_then(|value| value.get("text"))
                .and_then(Value::as_str)
                .map(|text| {
                    vec![NormalizedAgentEvent::AssistantMessage {
                        text: text.to_string(),
                    }]
                })
                .unwrap_or_default()
        }
        "turn.completed" => vec![NormalizedAgentEvent::TurnComplete],
        _ => vec![],
    }
}

#[cfg(test)]
pub(crate) fn build_codex_command_for_test(
    cwd: &Path,
    remote_session_id: Option<&str>,
    prompt: &str,
    model_override: Option<&str>,
) -> Result<Command> {
    CodexAdapter::new().build_command(cwd, remote_session_id, remote_session_id.is_some(), prompt, model_override)
}
