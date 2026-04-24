use crate::release::{check_app_update as check_latest_app_update, AppUpdateCheckResult};

#[tauri::command]
pub async fn check_app_update() -> Result<AppUpdateCheckResult, String> {
    Ok(check_latest_app_update().await)
}
