use std::sync::Arc;

use crate::terminal::TerminalManager;

pub struct AppState {
    pub terminal_manager: Arc<TerminalManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminal_manager: Arc::new(TerminalManager::default()),
        }
    }
}
