//! Comandos da busca de arquivos (Fase 4).

use tauri::{AppHandle, Manager, State};
use vitra_core::files::{status_from, EverythingStatus, FileHit};
use vitra_core::items::{launch_error_message, local_path};

use crate::win::{self, everything};
use crate::AppState;

const MAX_FILES: u32 = 20;

fn current_status(state: &AppState) -> EverythingStatus {
    let guard = state.everything.lock().unwrap();
    match guard.as_ref() {
        None => status_from(false, None, everything::installed()),
        Some(ev) => status_from(true, ev.probe(), everything::installed()),
    }
}

fn ensure_exists(path: &str) -> Result<(), String> {
    match local_path(path) {
        Some(p) if std::path::Path::new(p).exists() => Ok(()),
        _ => Err(launch_error_message(2).unwrap_or_default()),
    }
}

/// Arquivos e pastas que combinam com `query`. Erro = por que não dá para buscar agora.
#[tauri::command]
pub async fn search_files(app: AppHandle, query: String) -> Result<Vec<FileHit>, EverythingStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let guard = state.everything.lock().unwrap();
        let Some(ev) = guard.as_ref() else {
            return Err(EverythingStatus::DllMissing);
        };
        ev.search(&query, MAX_FILES)
            .map_err(|code| status_from(true, Some(code), everything::installed()))
    })
    .await
    .unwrap_or(Err(EverythingStatus::NotRunning))
}

#[tauri::command]
pub async fn everything_status(app: AppHandle) -> EverythingStatus {
    tauri::async_runtime::spawn_blocking(move || current_status(&app.state::<AppState>()))
        .await
        .unwrap_or(EverythingStatus::NotRunning)
}

#[tauri::command]
pub async fn everything_start() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(everything::start)
        .await
        .map_err(|_| "Não consegui abrir o Everything.".to_string())?
}

/// Pode levar alguns minutos (o winget baixa e instala).
#[tauri::command]
pub async fn everything_install() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(everything::install)
        .await
        .map_err(|_| "Não consegui instalar o Everything.".to_string())?
}

#[tauri::command]
pub async fn open_path(path: String, admin: bool) -> Result<(), String> {
    ensure_exists(&path)?;
    tauri::async_runtime::spawn_blocking(move || win::open(&path, "", admin))
        .await
        .map_err(|_| "Não consegui abrir este item.".to_string())?
}

#[tauri::command]
pub fn reveal_path(_state: State<'_, AppState>, path: String) -> Result<(), String> {
    ensure_exists(&path)?;
    win::reveal(&path)
}
