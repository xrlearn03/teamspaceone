use keyring::{Entry, Error as KeyringError};
use tauri::{command, AppHandle};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

#[command]
pub fn store_secure_token(service: String, account: String, token: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[command]
pub fn get_secure_token(service: String, account: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub fn delete_secure_token(service: String, account: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

#[command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[command]
pub fn pick_file(app: AppHandle) -> Result<Option<String>, String> {
    let dialog = app.dialog().file();
    let path = dialog.blocking_pick_file();
    Ok(path.and_then(|p| p.as_path().map(|p| p.to_string_lossy().to_string())))
}

#[command]
pub fn get_deep_link(app: AppHandle) -> Result<Vec<String>, String> {
    let urls = app
        .deep_link()
        .get_current()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    Ok(urls.into_iter().map(|u| u.to_string()).collect())
}

#[command]
pub fn get_app_info(app: AppHandle) -> Result<serde_json::Value, String> {
    let package = app.package_info();
    Ok(serde_json::json!({
        "name": package.name,
        "version": package.version.to_string(),
        "tauriVersion": tauri::VERSION,
    }))
}
