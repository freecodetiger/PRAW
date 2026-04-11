use anyhow::{anyhow, Result};
use serde::Serialize;
use tauri::AppHandle;

use crate::{
    config::AppConfig,
    storage,
    workspace::{WindowSnapshot, WorkspaceSnapshot},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrapState {
    pub config: AppConfig,
    pub window_snapshot: Option<WindowSnapshot>,
}

#[tauri::command]
pub fn load_app_bootstrap_state(app: AppHandle) -> Result<AppBootstrapState, String> {
    let config = storage::load_or_default::<_, AppConfig>(&app, "config/app-config.json")
        .map_err(|e| e.to_string())?;
    let snapshot = load_window_snapshot(&app).map_err(|e| e.to_string())?;

    Ok(AppBootstrapState {
        config,
        window_snapshot: if snapshot.is_empty() {
            None
        } else {
            Some(snapshot)
        },
    })
}

#[tauri::command]
pub fn save_app_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    storage::save_json(&app, "config/app-config.json", &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_window_snapshot(app: AppHandle, snapshot: WindowSnapshot) -> Result<(), String> {
    storage::save_json(&app, "workspace/window.json", &snapshot).map_err(|e| e.to_string())
}

fn load_window_snapshot(app: &AppHandle) -> Result<WindowSnapshot> {
    if let Some(raw) = storage::load_raw(app, "workspace/window.json")? {
        return parse_window_snapshot(&raw, "workspace/window.json");
    }

    if let Some(raw) = storage::load_raw(app, "workspace/workspace.json")? {
        if let Ok(window_snapshot) = parse_window_snapshot(&raw, "workspace/workspace.json") {
            return Ok(window_snapshot);
        }

        let legacy_workspace =
            serde_json::from_str::<WorkspaceSnapshot>(&raw).map_err(|error| {
                anyhow!(
                    "failed to parse legacy workspace snapshot workspace/workspace.json: {error}"
                )
            })?;

        return Ok(WindowSnapshot::from(legacy_workspace));
    }

    Ok(WindowSnapshot::default())
}

fn parse_window_snapshot(raw: &str, path: &str) -> Result<WindowSnapshot> {
    serde_json::from_str::<WindowSnapshot>(raw)
        .map_err(|error| anyhow!("failed to parse window snapshot {path}: {error}"))
}
