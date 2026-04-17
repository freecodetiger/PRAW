use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use anyhow::{Context, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};

use crate::commands::terminal::CreateTerminalSessionRequest;
use crate::events::{
    CreateTerminalSessionResponse, TerminalExitEvent, TerminalOutputEvent,
    TERMINAL_SEMANTIC_EVENT, TERMINAL_EXIT_EVENT, TERMINAL_OUTPUT_EVENT,
};

use super::{
    agent_bridge::PRAW_APP_BIN_ENV,
    session::TerminalSession,
    shell_integration,
    TerminalSemanticDetector,
};


static TERMINAL_DEBUG_ENABLED: OnceLock<bool> = OnceLock::new();

fn terminal_debug_enabled() -> bool {
    *TERMINAL_DEBUG_ENABLED.get_or_init(|| {
        let value = std::env::var("PRAW_TERMINAL_DEBUG").ok();
        parse_terminal_debug_flag(value.as_deref())
    })
}

fn parse_terminal_debug_flag(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim).filter(|value| !value.is_empty()),
        Some(value) if value.eq_ignore_ascii_case("1")
            || value.eq_ignore_ascii_case("true")
            || value.eq_ignore_ascii_case("yes")
            || value.eq_ignore_ascii_case("on")
    )
}

pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl TerminalManager {
    pub fn create_session(
        self: &Arc<Self>,
        app: AppHandle,
        request: CreateTerminalSessionRequest,
    ) -> Result<CreateTerminalSessionResponse> {
        if terminal_debug_enabled() {
            eprintln!(
                "[praw-terminal] create_session id={} shell={:?} cwd={:?}",
                request.session_id, request.shell, request.cwd
            );
        }
        let app_bin = std::env::current_exe()
            .context("failed to resolve current executable for agent host wrappers")?;
        let shell = resolve_shell(request.shell);
        let cwd = resolve_cwd(request.cwd)?;
        let mut cleanup_paths = vec![];
        let mut command = if let Some(command) =
            shell_integration::build_shell_integration_command(&shell, &request.session_id, &cwd)
        {
            cleanup_paths.extend(shell_integration::install_shell_integration(
                &shell,
                &request.session_id,
            )?);
            command
        } else {
            let mut command = CommandBuilder::new(shell.clone());
            command.cwd(&cwd);
            command
        };
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("PRAW_SESSION_ID", &request.session_id);
        command.env(PRAW_APP_BIN_ENV, &app_bin);

        if let Some(env) = request.env {
            for (key, value) in env {
                command.env(key, value);
            }
        }

        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to open PTY pair")?;

        let child = pair
            .slave
            .spawn_command(command)
            .context("failed to spawn shell in PTY")?;

        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .context("failed to clone PTY reader")?;
        let writer = pair
            .master
            .take_writer()
            .context("failed to take PTY writer")?;
        let killer = child.clone_killer();

        let session = Arc::new(TerminalSession::new(
            request.session_id.clone(),
            shell.clone(),
            cwd.clone(),
            pair.master,
            writer,
            killer,
            cleanup_paths,
        ));

        self.sessions
            .lock()
            .expect("terminal manager mutex poisoned")
            .insert(request.session_id.clone(), Arc::clone(&session));

        self.spawn_output_task(app.clone(), request.session_id.clone(), reader);
        self.spawn_exit_task(app, request.session_id.clone(), child);

        Ok(CreateTerminalSessionResponse {
            session_id: request.session_id,
            shell,
            cwd,
        })
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<()> {
        if terminal_debug_enabled() {
            eprintln!(
                "[praw-terminal] write id={} bytes={} preview={:?}",
                session_id,
                data.len(),
                data.chars().take(40).collect::<String>()
            );
        }
        let session = self
            .get(session_id)
            .with_context(|| format!("terminal session {session_id} not found"))?;
        session.write(data)
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        if terminal_debug_enabled() {
            eprintln!(
                "[praw-terminal] resize id={} cols={} rows={}",
                session_id, cols, rows
            );
        }
        let session = self
            .get(session_id)
            .with_context(|| format!("terminal session {session_id} not found"))?;
        session.resize(cols, rows)
    }

    pub fn close(&self, session_id: &str) -> Result<()> {
        let session = self
            .sessions
            .lock()
            .expect("terminal manager mutex poisoned")
            .remove(session_id)
            .with_context(|| format!("terminal session {session_id} not found"))?;

        session.kill()
    }
    fn get(&self, session_id: &str) -> Option<Arc<TerminalSession>> {
        self.sessions
            .lock()
            .expect("terminal manager mutex poisoned")
            .get(session_id)
            .cloned()
    }

    fn spawn_output_task(
        &self,
        app: AppHandle,
        session_id: String,
        mut reader: Box<dyn Read + Send>,
    ) {
        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            let mut semantic_detector = TerminalSemanticDetector::default();

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => {
                        let data = String::from_utf8_lossy(&buffer[..read]).to_string();
                        if data.is_empty() {
                            continue;
                        }

                        if terminal_debug_enabled() {
                            eprintln!(
                                "[praw-terminal] output id={} bytes={} preview={:?}",
                                session_id,
                                read,
                                data.chars().take(80).collect::<String>()
                            );
                        }

                        for semantic_event in semantic_detector.consume(&session_id, &data) {
                            let _ = app.emit(TERMINAL_SEMANTIC_EVENT, semantic_event);
                        }

                        let _ = app.emit(
                            TERMINAL_OUTPUT_EVENT,
                            TerminalOutputEvent {
                                session_id: session_id.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        });
    }

    fn spawn_exit_task(
        self: &Arc<Self>,
        app: AppHandle,
        session_id: String,
        mut child: Box<dyn Child + Send + Sync>,
    ) {
        let manager = Arc::clone(self);

        thread::spawn(move || {
            let payload = match child.wait() {
                Ok(status) => TerminalExitEvent {
                    session_id: session_id.clone(),
                    exit_code: Some(status.exit_code() as i32),
                    signal: status.signal().map(str::to_string),
                    error: None,
                },
                Err(error) => TerminalExitEvent {
                    session_id: session_id.clone(),
                    exit_code: None,
                    signal: None,
                    error: Some(format!("failed to wait on terminal session: {error}")),
                },
            };

            manager
                .sessions
                .lock()
                .expect("terminal manager mutex poisoned")
                .remove(&session_id);

            if terminal_debug_enabled() {
                eprintln!(
                    "[praw-terminal] exit id={} code={:?} signal={:?} error={:?}",
                    payload.session_id, payload.exit_code, payload.signal, payload.error
                );
            }
            let _ = app.emit(TERMINAL_EXIT_EVENT, payload);
        });
    }
}

fn resolve_shell(shell: Option<String>) -> String {
    match shell {
        Some(shell) if !shell.trim().is_empty() => shell,
        _ => std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
    }
}

fn resolve_cwd(cwd: Option<String>) -> Result<String> {
    let raw = cwd
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(default_cwd);

    let expanded = expand_home(&raw);
    let path = PathBuf::from(expanded);
    let resolved = if path.exists() && path.is_dir() {
        path
    } else {
        std::env::current_dir().context("failed to determine current working directory")?
    };

    Ok(resolved.to_string_lossy().into_owned())
}

fn default_cwd() -> String {
    std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
}

fn expand_home(path: &str) -> String {
    if path == "~" {
        return default_cwd();
    }

    if let Some(suffix) = path.strip_prefix("~/") {
        return format!("{}/{}", default_cwd(), suffix);
    }

    path.to_string()
}


#[cfg(test)]
mod tests {
    use super::parse_terminal_debug_flag;

    #[test]
    fn terminal_debug_flag_defaults_to_disabled() {
        assert!(!parse_terminal_debug_flag(None));
        assert!(!parse_terminal_debug_flag(Some("")));
        assert!(!parse_terminal_debug_flag(Some("0")));
        assert!(!parse_terminal_debug_flag(Some("false")));
        assert!(!parse_terminal_debug_flag(Some("off")));
    }

    #[test]
    fn terminal_debug_flag_accepts_common_truthy_values() {
        assert!(parse_terminal_debug_flag(Some("1")));
        assert!(parse_terminal_debug_flag(Some("true")));
        assert!(parse_terminal_debug_flag(Some("TRUE")));
        assert!(parse_terminal_debug_flag(Some("yes")));
        assert!(parse_terminal_debug_flag(Some("on")));
    }
}
