use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::structured_runtime::{capabilities_for_provider, run_provider_turn, should_fallback_to_raw};
use crate::events::{
    TerminalAgentEvent, TerminalAgentMode, TerminalAgentState, TERMINAL_AGENT_EVENT,
};

const AGENT_SOCKET_PREFIX: &str = "praw-agent-bridge";
pub const PRAW_AGENT_SOCKET_ENV: &str = "PRAW_AGENT_SOCKET";
pub const PRAW_APP_BIN_ENV: &str = "PRAW_APP_BIN";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderBridgeKind {
    Codex,
    Claude,
    Qwen,
}

impl ProviderBridgeKind {
    pub fn from_cli_name(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Self::Codex),
            "claude" => Some(Self::Claude),
            "qwen" | "qwen-code" => Some(Self::Qwen),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Qwen => "qwen",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NormalizedAgentEvent {
    AssistantMessage { text: String },
    Error { message: String },
    RemoteSession { id: String },
    TurnComplete,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum AgentControlMessage {
    SubmitPrompt { prompt: String },
    ResetSession,
    AttachSession { remote_session_id: String },
    SetModel { model: Option<String> },
}

#[derive(Default)]
pub struct AgentBridgeRegistry {
    socket_path: Mutex<Option<PathBuf>>,
    controls: Mutex<HashMap<String, Arc<Mutex<BufWriter<UnixStream>>>>>,
}

impl AgentBridgeRegistry {
    pub fn ensure_server(self: &Arc<Self>, app: AppHandle) -> Result<PathBuf> {
        let mut socket_path = self
            .socket_path
            .lock()
            .expect("agent bridge socket mutex poisoned");
        if let Some(existing) = socket_path.as_ref() {
            return Ok(existing.clone());
        }

        let path = std::env::temp_dir().join(format!(
            "{AGENT_SOCKET_PREFIX}-{}-{}.sock",
            std::process::id(),
            Uuid::new_v4()
        ));
        if path.exists() {
            let _ = fs::remove_file(&path);
        }

        let listener = UnixListener::bind(&path)
            .with_context(|| format!("failed to bind agent bridge socket {}", path.display()))?;
        let registry = Arc::clone(self);
        thread::spawn(move || registry.accept_loop(app, listener));
        *socket_path = Some(path.clone());
        Ok(path)
    }

    pub fn send_prompt(&self, session_id: &str, prompt: &str) -> Result<()> {
        self.send_control(
            session_id,
            &AgentControlMessage::SubmitPrompt {
                prompt: prompt.trim().to_string(),
            },
        )
    }

    pub fn reset_session(&self, session_id: &str) -> Result<()> {
        self.send_control(session_id, &AgentControlMessage::ResetSession)
    }

    pub fn attach_session(&self, session_id: &str, remote_session_id: &str) -> Result<()> {
        self.send_control(
            session_id,
            &AgentControlMessage::AttachSession {
                remote_session_id: remote_session_id.to_string(),
            },
        )
    }

    pub fn set_model(&self, session_id: &str, model: Option<&str>) -> Result<()> {
        self.send_control(
            session_id,
            &AgentControlMessage::SetModel {
                model: model.map(str::to_string),
            },
        )
    }

    pub fn remove_session(&self, session_id: &str) {
        self.controls
            .lock()
            .expect("agent bridge controls mutex poisoned")
            .remove(session_id);
    }

    fn accept_loop(self: Arc<Self>, app: AppHandle, listener: UnixListener) {
        for connection in listener.incoming() {
            let Ok(stream) = connection else {
                continue;
            };
            let registry = Arc::clone(&self);
            let app = app.clone();
            thread::spawn(move || {
                let _ = registry.handle_connection(app, stream);
            });
        }
    }

    fn handle_connection(&self, app: AppHandle, stream: UnixStream) -> Result<()> {
        let writer = stream
            .try_clone()
            .context("failed to clone agent bridge stream for writes")?;
        let writer = Arc::new(Mutex::new(BufWriter::new(writer)));
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        let mut registered_session_id: Option<String> = None;

        loop {
            line.clear();
            let read = reader
                .read_line(&mut line)
                .context("failed to read agent bridge event line")?;
            if read == 0 {
                break;
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let event: TerminalAgentEvent =
                serde_json::from_str(trimmed).context("failed to decode agent bridge event")?;
            let session_id = agent_event_session_id(&event).to_string();
            if registered_session_id.is_none() {
                self.controls
                    .lock()
                    .expect("agent bridge controls mutex poisoned")
                    .insert(session_id.clone(), Arc::clone(&writer));
                registered_session_id = Some(session_id.clone());
            }
            let _ = app.emit(TERMINAL_AGENT_EVENT, event);
        }

        if let Some(session_id) = registered_session_id {
            self.remove_session(&session_id);
        }
        Ok(())
    }

    fn send_control(&self, session_id: &str, message: &AgentControlMessage) -> Result<()> {
        let writer = {
            let controls = self
                .controls
                .lock()
                .expect("agent bridge controls mutex poisoned");
            controls
                .get(session_id)
                .cloned()
                .with_context(|| format!("structured agent bridge is not connected for session {session_id}"))?
        };

        let encoded = serde_json::to_string(message).context("failed to encode agent control message")?;
        let mut writer = writer
            .lock()
            .expect("agent bridge writer mutex poisoned");
        writer
            .write_all(encoded.as_bytes())
            .context("failed to write control message to agent bridge")?;
        writer
            .write_all(b"\n")
            .context("failed to terminate agent bridge control line")?;
        writer.flush().context("failed to flush agent bridge control")?;
        Ok(())
    }
}

fn agent_event_session_id(event: &TerminalAgentEvent) -> &str {
    match event {
        TerminalAgentEvent::BridgeState { session_id, .. }
        | TerminalAgentEvent::AssistantMessage { session_id, .. }
        | TerminalAgentEvent::Error { session_id, .. }
        | TerminalAgentEvent::TurnComplete { session_id, .. } => session_id,
    }
}

pub fn run_agent_host_from_args(args: &[String]) -> Result<bool> {
    if args.first().map(String::as_str) != Some("--praw-agent-host") {
        return Ok(false);
    }

    let provider = args
        .get(1)
        .and_then(|value| ProviderBridgeKind::from_cli_name(value))
        .with_context(|| "missing or unsupported provider for --praw-agent-host")?;
    let session_id = value_after(args, "--session-id")
        .with_context(|| "missing --session-id for --praw-agent-host")?;
    let cwd = value_after(args, "--cwd").with_context(|| "missing --cwd for --praw-agent-host")?;
    let passthrough_args = trailing_args(args);
    let socket_path = std::env::var(PRAW_AGENT_SOCKET_ENV)
        .context("missing PRAW_AGENT_SOCKET for structured agent host")?;

    if should_fallback_to_raw(provider, &passthrough_args) {
        let fallback = TerminalAgentEvent::BridgeState {
            session_id: session_id.to_string(),
            provider: provider.as_str().to_string(),
            mode: TerminalAgentMode::RawFallback,
            state: TerminalAgentState::Fallback,
            fallback_reason: Some("structured bridge unavailable for the current command".to_string()),
            capabilities: Some(capabilities_for_provider(provider)),
        };
        let _ = emit_bridge_event(&socket_path, &fallback);
        exec_raw_provider(provider, Path::new(cwd), &passthrough_args)?;
        return Ok(true);
    }

    run_structured_agent_host(provider, session_id, Path::new(cwd), Path::new(&socket_path))?;
    Ok(true)
}

fn run_structured_agent_host(
    provider: ProviderBridgeKind,
    session_id: &str,
    cwd: &Path,
    socket_path: &Path,
) -> Result<()> {
    let stream = UnixStream::connect(socket_path).with_context(|| {
        format!(
            "failed to connect to structured agent socket {}",
            socket_path.display()
        )
    })?;
    let read_stream = stream
        .try_clone()
        .context("failed to clone structured agent stream")?;
    let mut writer = BufWriter::new(stream);
    let mut reader = BufReader::new(read_stream);

    send_bridge_event(
        &mut writer,
        &TerminalAgentEvent::BridgeState {
            session_id: session_id.to_string(),
            provider: provider.as_str().to_string(),
            mode: TerminalAgentMode::Structured,
            state: TerminalAgentState::Ready,
            fallback_reason: None,
            capabilities: Some(capabilities_for_provider(provider)),
        },
    )?;

    let mut host_state = StructuredHostState::default();
    let mut line = String::new();

    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .context("failed to read structured agent control line")?;
        if read == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let control: AgentControlMessage =
            serde_json::from_str(trimmed).context("failed to decode structured agent control")?;
        match control {
            AgentControlMessage::SubmitPrompt { prompt } => {
                send_bridge_event(
                    &mut writer,
                    &TerminalAgentEvent::BridgeState {
                        session_id: session_id.to_string(),
                        provider: provider.as_str().to_string(),
                        mode: TerminalAgentMode::Structured,
                        state: TerminalAgentState::Running,
                        fallback_reason: None,
                        capabilities: Some(capabilities_for_provider(provider)),
                    },
                )?;

                host_state.remote_session_id = run_provider_turn(
                    provider,
                    session_id,
                    cwd,
                    host_state.remote_session_id,
                    &prompt,
                    &mut writer,
                    host_state.model_override.as_deref(),
                )?;

                send_bridge_event(
                    &mut writer,
                    &TerminalAgentEvent::BridgeState {
                        session_id: session_id.to_string(),
                        provider: provider.as_str().to_string(),
                        mode: TerminalAgentMode::Structured,
                        state: TerminalAgentState::Ready,
                        fallback_reason: None,
                        capabilities: Some(capabilities_for_provider(provider)),
                    },
                )?;
            }
            AgentControlMessage::ResetSession => {
                host_state.remote_session_id = None;
            }
            AgentControlMessage::AttachSession { remote_session_id } => {
                host_state.remote_session_id = Some(remote_session_id);
            }
            AgentControlMessage::SetModel { model } => {
                host_state.model_override = model;
            }
        }
    }

    Ok(())
}

#[derive(Default)]
struct StructuredHostState {
    remote_session_id: Option<String>,
    model_override: Option<String>,
}
fn exec_raw_provider(provider: ProviderBridgeKind, cwd: &Path, args: &[String]) -> Result<()> {
    let status = Command::new(provider.as_str())
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("failed to spawn raw {}", provider.as_str()))?;

    let code = status.code().unwrap_or(1);
    std::process::exit(code);
}

fn send_bridge_event(writer: &mut BufWriter<UnixStream>, event: &TerminalAgentEvent) -> Result<()> {
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

fn emit_bridge_event(socket_path: &str, event: &TerminalAgentEvent) -> Result<()> {
    let stream =
        UnixStream::connect(socket_path).with_context(|| format!("failed to connect to {socket_path}"))?;
    let mut writer = BufWriter::new(stream);
    send_bridge_event(&mut writer, event)
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.iter()
        .position(|value| value == flag)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
}

fn trailing_args(args: &[String]) -> Vec<String> {
    args.iter()
        .position(|value| value == "--")
        .map(|index| args.iter().skip(index + 1).cloned().collect())
        .unwrap_or_default()
}
