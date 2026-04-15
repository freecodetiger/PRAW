mod manager;
mod agent_bridge;
mod codex_sessions;
mod semantic;
mod session;
mod shell_integration;
mod structured_provider;
mod structured_runtime;

#[cfg(test)]
mod agent_bridge_test;
#[cfg(test)]
mod codex_sessions_test;
#[cfg(test)]
mod structured_runtime_test;
#[cfg(test)]
mod shell_integration_test;

pub use manager::TerminalManager;
pub use semantic::TerminalSemanticDetector;
pub use agent_bridge::run_agent_host_from_args;
pub use codex_sessions::{list_codex_sessions, CodexSessionSummary};
pub use structured_provider::{StructuredAgentCapabilities, StructuredProviderAdapter};
#[cfg(test)]
pub use codex_sessions::list_codex_sessions_from_paths;
