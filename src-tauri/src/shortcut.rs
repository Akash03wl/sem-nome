//! Atalho global que abre e fecha o pop-up.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::windows;

pub fn handler(app: &AppHandle, _shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() == ShortcutState::Pressed {
        windows::toggle_quick(app);
    }
}

fn unavailable(hotkey: &str) -> String {
    format!("Não consegui usar o atalho {hotkey}. Escolha outro.")
}

/// Registra o atalho (já normalizado). Devolve a mensagem para o usuário se falhar.
pub fn register(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    app.global_shortcut()
        .register(hotkey)
        .map_err(|_| unavailable(hotkey))
}

/// Troca o atalho. Se o novo falhar, o antigo volta a funcionar.
pub fn replace(app: &AppHandle, old: &str, new: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    if old == new && gs.is_registered(old) {
        return Ok(());
    }
    let _ = gs.unregister(old);
    if let Err(msg) = register(app, new) {
        let _ = register(app, old);
        return Err(msg);
    }
    Ok(())
}
