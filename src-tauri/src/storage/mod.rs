use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager, Runtime};

pub fn load_or_default<R, T>(app: &AppHandle<R>, relative_path: &str) -> Result<T>
where
    R: Runtime,
    T: DeserializeOwned + Default,
{
    let path = resolve_config_path(app, relative_path)?;
    if !path.exists() {
        return Ok(T::default());
    }

    let raw = fs::read_to_string(&path)
        .with_context(|| format!("failed to read storage file {}", path.display()))?;
    let value = serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse storage file {}", path.display()))?;
    Ok(value)
}

pub fn load_raw<R>(app: &AppHandle<R>, relative_path: &str) -> Result<Option<String>>
where
    R: Runtime,
{
    let path = resolve_config_path(app, relative_path)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path)
        .with_context(|| format!("failed to read storage file {}", path.display()))?;
    Ok(Some(raw))
}

pub fn save_json<R, T>(app: &AppHandle<R>, relative_path: &str, value: &T) -> Result<()>
where
    R: Runtime,
    T: Serialize,
{
    let path = resolve_config_path(app, relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create storage dir {}", parent.display()))?;
    }

    let raw = serde_json::to_string_pretty(value)?;
    fs::write(&path, raw)
        .with_context(|| format!("failed to write storage file {}", path.display()))?;
    Ok(())
}

fn resolve_config_path<R: Runtime>(app: &AppHandle<R>, relative_path: &str) -> Result<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("failed to resolve app config directory")?;
    Ok(config_dir.join(relative_path))
}
