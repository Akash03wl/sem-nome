mod commands;
mod files_cmds;
mod library_cmds;
mod win;
mod shortcut;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use vitra_core::library::{load_library, Library};
use vitra_core::settings::{self, Settings};

/// Estado compartilhado do app.
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    /// Erro ao registrar o atalho na inicialização (mostrado no painel).
    pub hotkey_error: Mutex<Option<String>>,
    /// Quando o pop-up foi escondido por perder o foco (evita reabrir no mesmo clique da bandeja).
    pub last_blur_hide: Mutex<Option<Instant>>,
    pub library: Mutex<Library>,
    pub library_path: PathBuf,
    /// Apps do Menu Iniciar e da Store (preenchido em segundo plano).
    pub discovered: Mutex<Vec<win::Discovered>>,
    pub icon_dir: PathBuf,
    /// DLL do Everything (busca de arquivos); `None` se não veio no instalador.
    pub everything: Mutex<Option<win::everything::Everything>>,
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            library_cmds::get_library,
            library_cmds::get_discovered,
            library_cmds::rediscover,
            library_cmds::library_apply,
            library_cmds::launch_item,
            library_cmds::reveal_item,
            library_cmds::get_icon,
            library_cmds::add_paths,
            library_cmds::add_site,
            library_cmds::open_url,
            library_cmds::run_system_command,
            files_cmds::search_files,
            files_cmds::everything_status,
            files_cmds::everything_start,
            files_cmds::everything_install,
            files_cmds::open_path,
            files_cmds::reveal_path,
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
            // %APPDATA%\Vitra e %LOCALAPPDATA%\Vitra (como no documento do projeto).
            let config_dir = app.path().config_dir()?.join("Vitra");
            let settings_path = config_dir.join("settings.json");
            let library_path = config_dir.join("library.json");
            let loaded = settings::load(&settings_path);

            app.manage(AppState {
                settings: Mutex::new(loaded.clone()),
                settings_path,
                hotkey_error: Mutex::new(None),
                last_blur_hide: Mutex::new(None),
                library: Mutex::new(load_library(&library_path)),
                library_path,
                discovered: Mutex::new(Vec::new()),
                icon_dir: app.path().local_data_dir()?.join("Vitra").join("icons"),
                everything: Mutex::new(
                    app.path()
                        .resource_dir()
                        .ok()
                        .and_then(|dir| win::everything::Everything::load(&dir.join("Everything64.dll"))),
                ),
            });
            library_cmds::spawn_discovery(app.handle().clone());

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
