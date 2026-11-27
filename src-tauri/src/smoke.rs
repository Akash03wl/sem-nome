//! Diário do teste automático do app instalado (CI). Só escreve quando a variável
//! `VITRA_SMOKE_FILE` existe; no uso normal não faz nada.

use std::io::Write;

pub fn note(line: &str) {
    let Some(path) = std::env::var_os("VITRA_SMOKE_FILE") else { return };
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{line}");
    }
}

/// O frontend de uma janela carregou e conseguiu falar com o Rust.
#[tauri::command]
pub fn frontend_ready(label: String) {
    note(&format!("ready:{label}"));
}
