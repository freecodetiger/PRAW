mod manager;
mod semantic;
mod session;
mod shell_integration;

#[cfg(test)]
mod shell_integration_test;

pub use manager::TerminalManager;
pub use semantic::TerminalSemanticDetector;
