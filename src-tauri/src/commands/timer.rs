use tauri::State;

use crate::app_state::AppState;

#[tauri::command]
pub fn play_timer_completion_sound(
    state: State<'_, AppState>,
    sound: String,
) -> Result<(), String> {
    state.timer_sound_manager.play(&sound)
}
