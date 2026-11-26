//! Comandos chamados pelo frontend (`src/lib/api.ts`).

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;
use vitra_core::{
    hotkey,
    settings::{self, plan_save, validate_shortcut, Settings, ACCENTS},
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

fn set_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    let result = if enabled { autolaunch.enable() } else { autolaunch.disable() };
    result.map_err(|_| "Não consegui alterar a inicialização com o Windows.".to_string())
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
    // Cada palavra-chave é validada contra as outras da lista.
    let mut shortcuts = Vec::with_capacity(next.web_shortcuts.len());
    for (i, s) in next.web_shortcuts.iter().enumerate() {
        let others: Vec<_> = next.web_shortcuts.iter().enumerate().filter(|(j, _)| *j != i).map(|(_, o)| o.clone()).collect();
        shortcuts.push(validate_shortcut(s, &others)?);
    }
    let next = Settings { hotkey, web_shortcuts: shortcuts, ..next };
    let failing = state.hotkey_error.lock().unwrap().is_some();
    let plan = plan_save(&current, &next, failing);

    // 1. Atalho. Trocado pelo usuário: se falhar, nada é salvo e o antigo continua.
    //    Igual mas falhando desde o início: tenta de novo sem bloquear o resto.
    let mut hotkey_ok = !failing;
    if plan.register_hotkey {
        match shortcut::replace(&app, &current.hotkey, &next.hotkey) {
            Ok(()) => hotkey_ok = true,
            Err(msg) if plan.hotkey_required => return Err(msg),
            Err(_) => {}
        }
    }
    let undo_hotkey = |app: &AppHandle| {
        if plan.hotkey_required {
            let _ = shortcut::replace(app, &next.hotkey, &current.hotkey);
        }
    };

    // 2. Abrir com o Windows (desfaz o atalho se falhar).
    if let Some(enabled) = plan.autostart {
        if let Err(msg) = set_autostart(&app, enabled) {
            undo_hotkey(&app);
            return Err(msg);
        }
    }

    // 3. Gravar (desfaz o que já mudou se falhar).
    if settings::save(&state.settings_path, &next).is_err() {
        undo_hotkey(&app);
        if let Some(enabled) = plan.autostart {
            let _ = set_autostart(&app, !enabled);
        }
        return Err("Não consegui salvar as configurações.".into());
    }

    if hotkey_ok {
        *state.hotkey_error.lock().unwrap() = None;
    }
    *state.settings.lock().unwrap() = next.clone();
    let _ = app.emit("settings-changed", next.clone());
    Ok(next)
}

#[tauri::command]
pub fn hide_quick(app: AppHandle) {
    windows::hide_quick(&app);
}

#[tauri::command]
pub fn open_panel(app: AppHandle) {
    windows::open_panel(&app);
}
