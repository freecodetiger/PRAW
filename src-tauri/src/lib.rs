mod ai;
mod app_state;
mod commands;
mod completion;
mod config;
mod events;
mod release;
mod storage;
mod terminal;
mod voice;
mod workspace;

use app_state::AppState;
use commands::ai::{
    request_ai_inline_suggestions, request_ai_intent_suggestions, request_ai_recovery_suggestions,
    request_completion, test_ai_connection,
};
use commands::bootstrap::{
    load_app_bootstrap_state, save_app_config, save_window_snapshot,
    save_workspace_collection_snapshot,
};
use commands::completion::{
    record_completion_command_execution, record_completion_suggestion_acceptance,
    request_local_completion,
};
use commands::release::check_app_update;
use commands::terminal::{
    close_terminal_session, create_terminal_session, resize_terminal_session,
    write_terminal_session,
};
use commands::voice::{
    cancel_voice_transcription, start_voice_transcription, stop_voice_transcription,
};

#[cfg(target_os = "linux")]
fn should_allow_linux_webview_permission_request(is_user_media_request: bool) -> bool {
    is_user_media_request
}

#[cfg(target_os = "linux")]
fn configure_linux_webview_permissions<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    use tauri::Manager;
    use webkit2gtk::{
        glib::prelude::ObjectExt, PermissionRequest, PermissionRequestExt,
        UserMediaPermissionRequest, WebViewExt,
    };

    let Some(main_webview) = app.get_webview_window("main") else {
        return Ok(());
    };

    main_webview.with_webview(|webview| {
        webview
            .inner()
            .connect_permission_request(|_, request: &PermissionRequest| {
                let allow_request =
                    should_allow_linux_webview_permission_request(request.is::<UserMediaPermissionRequest>());

                if allow_request {
                    request.allow();
                    return true;
                }

                false
            });
    })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            configure_linux_webview_permissions(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_bootstrap_state,
            save_app_config,
            save_window_snapshot,
            save_workspace_collection_snapshot,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            close_terminal_session,
            request_completion,
            request_ai_inline_suggestions,
            request_ai_intent_suggestions,
            request_ai_recovery_suggestions,
            test_ai_connection,
            request_local_completion,
            record_completion_command_execution,
            record_completion_suggestion_acceptance,
            check_app_update,
            start_voice_transcription,
            stop_voice_transcription,
            cancel_voice_transcription
        ])
        .run(tauri::generate_context!())
        .expect("error while running PRAW");
}

pub fn run_special_mode_from_args(args: &[String]) -> Result<bool, String> {
    terminal::run_agent_host_from_args(args).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "linux")]
    use super::should_allow_linux_webview_permission_request;

    #[cfg(target_os = "linux")]
    #[test]
    fn allows_linux_user_media_permission_requests() {
        assert!(should_allow_linux_webview_permission_request(true));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn does_not_auto_allow_other_linux_webview_permissions() {
        assert!(!should_allow_linux_webview_permission_request(false));
    }
}
