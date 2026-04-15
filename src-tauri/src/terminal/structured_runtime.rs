use std::io::{BufRead, BufReader, BufWriter, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
use serde_json::Value;
use uuid::Uuid;

use crate::events::TerminalAgentEvent;

use super::agent_bridge::{NormalizedAgentEvent, ProviderBridgeKind};
use super::structured_codex::CodexAdapter;
use super::structured_provider::{StructuredAgentCapabilities, StructuredProviderAdapter};
use super::structured_qwen::QwenAdapter;

pub fn adapter_for_provider(provider: ProviderBridgeKind) -> Box<dyn StructuredProviderAdapter> {
    match provider {
        ProviderBridgeKind::Codex => Box::new(CodexAdapter::new()),
        ProviderBridgeKind::Claude => Box::new(ClaudeAdapter),
        ProviderBridgeKind::Qwen => Box::new(QwenAdapter::new()),
    }
}

pub fn capabilities_for_provider(provider: ProviderBridgeKind) -> StructuredAgentCapabilities {
    adapter_for_provider(provider).capabilities()
}

pub fn should_fallback_to_raw(provider: ProviderBridgeKind, passthrough_args: &[String]) -> bool {
    adapter_for_provider(provider).should_fallback_to_raw(passthrough_args)
}

pub fn parse_provider_stream_line(
    provider: ProviderBridgeKind,
    line: &str,
) -> Result<Vec<NormalizedAgentEvent>> {
    let raw: Value = serde_json::from_str(line).context("failed to decode provider JSON line")?;
    Ok(adapter_for_provider(provider).parse_line(&raw))
}

pub fn run_provider_turn(
    provider: ProviderBridgeKind,
    session_id: &str,
    cwd: &Path,
    remote_session_id: Option<String>,
    prompt: &str,
    writer: &mut BufWriter<UnixStream>,
    model_override: Option<&str>,
) -> Result<Option<String>> {
    let normalized_prompt = prompt.trim();
    if normalized_prompt.is_empty() {
        return Ok(remote_session_id);
    }

    let adapter = adapter_for_provider(provider);
    let is_resume = remote_session_id.is_some();
    let mut next_remote_session_id = remote_session_id;
    if next_remote_session_id.is_none() && adapter.requires_synthetic_session_id() {
        next_remote_session_id = Some(Uuid::new_v4().to_string());
    }

    let mut child = adapter
        .build_command(
            cwd,
            next_remote_session_id.as_deref(),
            is_resume,
            normalized_prompt,
            model_override,
        )?
        .spawn()
        .with_context(|| format!("failed to spawn {} structured bridge", provider.as_str()))?;

    if let Some(payload) = adapter.prompt_payload(normalized_prompt)? {
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(payload.as_bytes())
                .context("failed to write structured prompt payload")?;
        }
    }

    let stdout = child
        .stdout
        .take()
        .context("structured bridge stdout was not piped")?;
    let mut stdout = BufReader::new(stdout);
    let mut line = String::new();
    loop {
        line.clear();
        let read = stdout
            .read_line(&mut line)
            .context("failed to read provider output line")?;
        if read == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        for event in parse_provider_stream_line(provider, trimmed)? {
            match event {
                NormalizedAgentEvent::RemoteSession { id } => {
                    next_remote_session_id = Some(id);
                }
                NormalizedAgentEvent::AssistantMessage { text } => {
                    send_turn_event(
                        writer,
                        &TerminalAgentEvent::AssistantMessage {
                            session_id: session_id.to_string(),
                            provider: provider.as_str().to_string(),
                            text,
                        },
                    )?;
                }
                NormalizedAgentEvent::Error { message } => {
                    send_turn_event(
                        writer,
                        &TerminalAgentEvent::Error {
                            session_id: session_id.to_string(),
                            provider: provider.as_str().to_string(),
                            message,
                        },
                    )?;
                }
                NormalizedAgentEvent::TurnComplete => {
                    send_turn_event(
                        writer,
                        &TerminalAgentEvent::TurnComplete {
                            session_id: session_id.to_string(),
                            provider: provider.as_str().to_string(),
                        },
                    )?;
                }
            }
        }
    }

    let output = child
        .wait_with_output()
        .context("failed to collect structured bridge output")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            send_turn_event(
                writer,
                &TerminalAgentEvent::Error {
                    session_id: session_id.to_string(),
                    provider: provider.as_str().to_string(),
                    message: stderr,
                },
            )?;
            send_turn_event(
                writer,
                &TerminalAgentEvent::TurnComplete {
                    session_id: session_id.to_string(),
                    provider: provider.as_str().to_string(),
                },
            )?;
        }
    }

    Ok(next_remote_session_id)
}

fn send_turn_event(writer: &mut BufWriter<UnixStream>, event: &TerminalAgentEvent) -> Result<()> {
    let encoded = serde_json::to_string(event).context("failed to encode terminal agent event")?;
    writer
        .write_all(encoded.as_bytes())
        .context("failed to write terminal agent event")?;
    writer
        .write_all(b"\n")
        .context("failed to terminate terminal agent event line")?;
    writer.flush().context("failed to flush terminal agent event")?;
    Ok(())
}

struct ClaudeAdapter;

impl StructuredProviderAdapter for ClaudeAdapter {
    fn provider_id(&self) -> &'static str {
        "claude"
    }

    fn capabilities(&self) -> StructuredAgentCapabilities {
        StructuredAgentCapabilities {
            supports_resume_picker: false,
            supports_direct_resume: true,
            supports_review: false,
            supports_model_override: false,
            shows_bypass_capsule: true,
        }
    }

    fn requires_synthetic_session_id(&self) -> bool {
        true
    }

    fn build_command(
        &self,
        cwd: &Path,
        remote_session_id: Option<&str>,
        is_resume: bool,
        _prompt: &str,
        _model_override: Option<&str>,
    ) -> Result<Command> {
        let mut command = Command::new(self.provider_id());
        command.current_dir(cwd);
        command.args([
            "-p",
            "--verbose",
            "--output-format",
            "stream-json",
            "--input-format",
            "stream-json",
        ]);
        if is_resume {
            let session_id = remote_session_id.context("claude resume bridge should include a session id")?;
            command.args(["--resume", session_id]);
        } else if let Some(session_id) = remote_session_id {
            command.args(["--session-id", session_id]);
        }
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        Ok(command)
    }

    fn prompt_payload(&self, prompt: &str) -> Result<Option<String>> {
        Ok(Some(format!(
            "{{\"type\":\"user\",\"message\":{{\"role\":\"user\",\"content\":[{{\"type\":\"text\",\"text\":{}}}]}}}}\n",
            serde_json::to_string(prompt)?
        )))
    }

    fn parse_line(&self, raw: &Value) -> Vec<NormalizedAgentEvent> {
        let Some(kind) = raw.get("type").and_then(Value::as_str) else {
            return vec![];
        };

        match kind {
            "assistant" => extract_text_content(raw.get("message").and_then(|value| value.get("content"))),
            "result" => {
                if raw.get("is_error").and_then(Value::as_bool) == Some(true) {
                    let message = raw
                        .get("result")
                        .and_then(Value::as_str)
                        .unwrap_or("Claude bridge failed");
                    vec![NormalizedAgentEvent::Error {
                        message: message.to_string(),
                    }]
                } else {
                    vec![NormalizedAgentEvent::TurnComplete]
                }
            }
            _ => vec![],
        }
    }
}

fn extract_text_content(value: Option<&Value>) -> Vec<NormalizedAgentEvent> {
    let Some(entries) = value.and_then(Value::as_array) else {
        return vec![];
    };

    entries
        .iter()
        .filter_map(|entry| {
            if entry.get("type").and_then(Value::as_str) != Some("text") {
                return None;
            }
            entry.get("text").and_then(Value::as_str).map(|text| {
                NormalizedAgentEvent::AssistantMessage {
                    text: text.to_string(),
                }
            })
        })
        .collect()
}
