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
use commands::ai::{
    request_ai_inline_suggestions, request_ai_recovery_suggestions, request_completion,
    test_ai_connection,
};
use commands::bootstrap::{load_app_bootstrap_state, save_app_config, save_window_snapshot};
use commands::completion::request_local_completion;
use commands::terminal::{
    attach_terminal_agent_session, close_terminal_session, create_terminal_session,
    list_codex_sessions, reset_terminal_agent_session, resize_terminal_session,
    run_terminal_agent_review, set_terminal_agent_model, submit_terminal_agent_prompt,
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
            submit_terminal_agent_prompt,
            reset_terminal_agent_session,
            attach_terminal_agent_session,
            set_terminal_agent_model,
            list_codex_sessions,
            run_terminal_agent_review,
            request_completion,
            request_ai_inline_suggestions,
            request_ai_recovery_suggestions,
            test_ai_connection,
            request_local_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running PRAW");
}

pub fn run_special_mode_from_args(args: &[String]) -> Result<bool, String> {
    terminal::run_agent_host_from_args(args).map_err(|error| error.to_string())
}
