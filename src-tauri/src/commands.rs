//! Comandos chamados pelo frontend (`src/lib/api.ts`).

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;
use vitra_core::{
    hotkey,
    settings::{self, Settings, ACCENTS},
};

use crate::{shortcut, windows, AppState};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_hotkey_error(state: State<'_, AppState>) -> Option<String> {
    state.hotkey_error.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    next: Settings,
) -> Result<Settings, String> {
    let current = state.settings.lock().unwrap().clone();

    let hotkey = hotkey::normalize(&next.hotkey).map_err(|e| e.to_string())?;
    if !ACCENTS.contains(&next.accent.as_str()) {
        return Err("Cor inválida.".into());
    }

    if next.autostart != current.autostart {
        let autolaunch = app.autolaunch();
        let result = if next.autostart { autolaunch.enable() } else { autolaunch.disable() };
        result.map_err(|_| "Não consegui alterar a inicialização com o Windows.".to_string())?;
    }

    // Se o atalho falhou na inicialização, `current.hotkey` não está registrado:
    // `replace` tenta o novo mesmo que seja igual ao antigo.
    shortcut::replace(&app, &current.hotkey, &hotkey)?;
    *state.hotkey_error.lock().unwrap() = None;

    let saved = Settings { hotkey, ..next };
    settings::save(&state.settings_path, &saved)
        .map_err(|_| "Não consegui salvar as configurações.".to_string())?;
    *state.settings.lock().unwrap() = saved.clone();
    let _ = app.emit("settings-changed", saved.clone());
    Ok(saved)
}

#[tauri::command]
pub fn hide_quick(app: AppHandle) {
    windows::hide_quick(&app);
}

#[tauri::command]
pub fn open_panel(app: AppHandle) {
    windows::open_panel(&app);
}
