use std::sync::Arc;

use crate::{terminal::TerminalManager, voice::VoiceTranscriptionManager};

pub struct AppState {
    pub terminal_manager: Arc<TerminalManager>,
    pub voice_manager: Arc<VoiceTranscriptionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminal_manager: Arc::new(TerminalManager::default()),
            voice_manager: Arc::new(VoiceTranscriptionManager::default()),
        }
    }
}
