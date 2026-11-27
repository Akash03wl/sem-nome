//! Abrir o Vitra com o Windows. Grava **sempre só no usuário atual** (HKCU\…\Run):
//! mesmo que o Vitra seja aberto como administrador, ele nunca se registra para todos os usuários.

use auto_launch::{AutoLaunch, AutoLaunchBuilder, WindowsEnableMode};

fn launcher() -> Result<AutoLaunch, String> {
    let exe = std::env::current_exe().map_err(|_| "Não encontrei o executável do Vitra.".to_string())?;
    AutoLaunchBuilder::new()
        .set_app_name("Vitra")
        .set_app_path(&exe.display().to_string())
        .set_args(&["--hidden"])
        .set_windows_enable_mode(WindowsEnableMode::CurrentUser)
        .build()
        .map_err(|_| "Não consegui configurar a inicialização com o Windows.".to_string())
}

pub fn set(enabled: bool) -> Result<(), String> {
    let l = launcher()?;
    let result = if enabled { l.enable() } else { l.disable() };
    result.map_err(|_| "Não consegui alterar a inicialização com o Windows.".to_string())
}

pub fn is_enabled() -> bool {
    launcher().ok().and_then(|l| l.is_enabled().ok()).unwrap_or(false)
}

/// Deixa o registro do Windows igual à preferência salva. Em builds de desenvolvimento
/// (`tauri dev`) não mexe em nada, para não registrar o executável de teste.
pub fn sync(wanted: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    if wanted != is_enabled() {
        let _ = set(wanted);
    }
}
