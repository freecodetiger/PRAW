use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::{config::AppConfig, storage, workspace::WindowSnapshot};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrapState {
    pub config: AppConfig,
    pub workspace_collection_snapshot: Option<Value>,
    pub window_snapshot: Option<Value>,
}

#[tauri::command]
pub fn load_app_bootstrap_state(app: AppHandle) -> Result<AppBootstrapState, String> {
    let config = storage::load_or_default::<_, AppConfig>(&app, "config/app-config.json")
        .map_err(|e| e.to_string())?;
    let collection_snapshot = load_workspace_collection_snapshot(&app).map_err(|e| e.to_string())?;
    let window_snapshot = load_window_snapshot(&app).map_err(|e| e.to_string())?;

    Ok(AppBootstrapState {
        config,
        workspace_collection_snapshot: collection_snapshot,
        window_snapshot,
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

#[tauri::command]
pub fn save_workspace_collection_snapshot(app: AppHandle, snapshot: Value) -> Result<(), String> {
    storage::save_json(&app, "workspace/workspaces.json", &snapshot).map_err(|e| e.to_string())
}

fn load_workspace_collection_snapshot(app: &AppHandle) -> Result<Option<Value>> {
    if let Some(raw) = storage::load_raw(app, "workspace/workspaces.json")? {
        let value = parse_json_value(&raw, "workspace/workspaces.json")?;
        return Ok(Some(value));
    }

    Ok(None)
}

fn load_window_snapshot(app: &AppHandle) -> Result<Option<Value>> {
    if let Some(raw) = storage::load_raw(app, "workspace/window.json")? {
        let value = parse_json_value(&raw, "workspace/window.json")?;
        return Ok(if is_empty_window_snapshot(&value) {
            None
        } else {
            Some(value)
        });
    }

    if let Some(raw) = storage::load_raw(app, "workspace/workspace.json")? {
        let value = parse_json_value(&raw, "workspace/workspace.json")?;
        return Ok(Some(value));
    }

    Ok(None)
}

fn parse_json_value(raw: &str, path: &str) -> Result<Value> {
    serde_json::from_str::<Value>(raw)
        .map_err(|error| anyhow!("failed to parse persisted JSON {path}: {error}"))
}

fn is_empty_window_snapshot(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };

    let tabs_empty = object
        .get("tabs")
        .and_then(|tabs| tabs.as_array())
        .is_some_and(|tabs| tabs.is_empty());
    let layout_missing = object.get("layout").is_none()
        || object.get("layout").is_some_and(|layout| layout.is_null());

    tabs_empty || layout_missing
}
