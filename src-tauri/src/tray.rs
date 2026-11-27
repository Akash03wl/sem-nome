//! Ícone do Vitra na bandeja (perto do relógio).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::windows;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "abrir-painel", "Abrir painel", true, None::<&str>)?;
    let config = MenuItem::with_id(app, "configuracoes", "Configurações", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "sair", "Sair do Vitra", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &config, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("vitra")
        .tooltip("Vitra")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "abrir-painel" | "configuracoes" => windows::open_panel(app),
            "sair" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::toggle_quick(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
