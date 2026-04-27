use std::sync::Arc;

use crate::{
    terminal::TerminalManager, timer_sound::TimerSoundManager, voice::VoiceTranscriptionManager,
};

pub struct AppState {
    pub terminal_manager: Arc<TerminalManager>,
    pub timer_sound_manager: Arc<TimerSoundManager>,
    pub voice_manager: Arc<VoiceTranscriptionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminal_manager: Arc::new(TerminalManager::default()),
            timer_sound_manager: Arc::new(TimerSoundManager::default()),
            voice_manager: Arc::new(VoiceTranscriptionManager::default()),
        }
    }
}
