//! Janelas do Vitra: o pop-up rápido ("quick") e o painel ("panel").

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};
use vitra_core::geometry::{center_in_monitor, Rect};

use crate::AppState;

pub const QUICK: &str = "quick";
pub const PANEL: &str = "panel";

/// Tamanho lógico do pop-up (igual ao `tauri.conf.json`).
const QUICK_W: u32 = 720;
const QUICK_H: u32 = 452;

/// Vidro nativo: Mica no Windows 11, Acrílico como alternativa (Windows 10).
pub fn apply_glass(window: &WebviewWindow) {
    if window_vibrancy::apply_mica(window, Some(true)).is_err() {
        let _ = window_vibrancy::apply_acrylic(window, Some((26, 31, 43, 180)));
    }
}

/// Centraliza o pop-up no monitor onde está o mouse.
fn position_quick(app: &AppHandle, window: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let area = m.work_area();
        let rect = Rect {
            x: area.position.x,
            y: area.position.y,
            w: area.size.width,
            h: area.size.height,
        };
        let (x, y) = center_in_monitor(rect, QUICK_W, QUICK_H, m.scale_factor());
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

pub fn show_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK) {
        position_quick(app, &w);
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit_to(QUICK, "quick-shown", ());
    }
}

pub fn hide_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK) {
        let _ = w.hide();
    }
}

/// Esconde ao perder o foco e lembra quando foi.
pub fn hide_after_blur(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK) {
        if w.is_visible().unwrap_or(false) {
            *app.state::<AppState>().last_blur_hide.lock().unwrap() = Some(Instant::now());
            let _ = w.hide();
        }
    }
}

pub fn toggle_quick(app: &AppHandle) {
    let Some(w) = app.get_webview_window(QUICK) else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    // O clique na bandeja tira o foco do pop-up antes de chegar aqui:
    // se ele acabou de sumir por isso, o clique era para fechar.
    let last = *app.state::<AppState>().last_blur_hide.lock().unwrap();
    let recent = last.is_some_and(|t| t.elapsed() < Duration::from_millis(300));
    if !recent {
        show_quick(app);
    }
}

pub fn open_panel(app: &AppHandle) {
    hide_quick(app);
    if let Some(w) = app.get_webview_window(PANEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
