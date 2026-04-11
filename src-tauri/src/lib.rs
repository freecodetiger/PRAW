mod ai;
mod app_state;
mod commands;
mod completion;
mod config;
mod events;
mod storage;
mod terminal;
mod workspace;

use app_state::AppState;
use commands::ai::{request_completion, test_ai_connection};
use commands::bootstrap::{load_app_bootstrap_state, save_app_config, save_window_snapshot};
use commands::completion::request_local_completion;
use commands::terminal::{
    close_terminal_session, create_terminal_session, resize_terminal_session,
    write_terminal_session,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_bootstrap_state,
            save_app_config,
            save_window_snapshot,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            close_terminal_session,
            request_completion,
            test_ai_connection,
            request_local_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running PRAW");
}
