mod manager;
mod agent_bridge;
mod codex_sessions;
mod semantic;
mod session;
mod shell_integration;

#[cfg(test)]
mod agent_bridge_test;
#[cfg(test)]
mod codex_sessions_test;
#[cfg(test)]
mod shell_integration_test;

pub use manager::TerminalManager;
pub use semantic::TerminalSemanticDetector;
pub use agent_bridge::run_agent_host_from_args;
pub use codex_sessions::{list_codex_sessions, CodexSessionSummary};
#[cfg(test)]
pub use codex_sessions::list_codex_sessions_from_paths;
