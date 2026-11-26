mod commands;
mod shortcut;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use vitra_core::settings::{self, Settings};

/// Estado compartilhado do app.
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    /// Erro ao registrar o atalho na inicialização (mostrado no painel).
    pub hotkey_error: Mutex<Option<String>>,
    /// Quando o pop-up foi escondido por perder o foco (evita reabrir no mesmo clique da bandeja).
    pub last_blur_hide: Mutex<Option<Instant>>,
}

pub fn run() {
    tauri::Builder::default()
        // Precisa ser o primeiro plugin: uma segunda execução só mostra o pop-up.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_quick(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcut::handler)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::hide_quick,
            commands::open_panel,
            commands::get_hotkey_error,
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) if window.label() == windows::QUICK => {
                windows::hide_after_blur(window.app_handle());
            }
            WindowEvent::CloseRequested { api, .. } if window.label() == windows::PANEL => {
                // Fechar o painel só esconde; o app sai pelo menu da bandeja.
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let loaded = settings::load(&settings_path);

            app.manage(AppState {
                settings: Mutex::new(loaded.clone()),
                settings_path,
                hotkey_error: Mutex::new(None),
                last_blur_hide: Mutex::new(None),
            });

            if let Some(quick) = app.get_webview_window(windows::QUICK) {
                windows::apply_glass(&quick);
            }
            tray::create(app.handle())?;

            // Mantém o registro do Windows igual à preferência salva.
            let autolaunch = app.autolaunch();
            match (loaded.autostart, autolaunch.is_enabled().unwrap_or(false)) {
                (true, false) => {
                    let _ = autolaunch.enable();
                }
                (false, true) => {
                    let _ = autolaunch.disable();
                }
                _ => {}
            }

            if let Err(msg) = shortcut::register(app.handle(), &loaded.hotkey) {
                *app.state::<AppState>().hotkey_error.lock().unwrap() = Some(msg);
                windows::open_panel(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Vitra");
}
