//! Abre itens com o Shell do Windows.

use std::process::Command;

use vitra_core::items::launch_error_message;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// Abre um programa, pasta, arquivo ou site. `admin` pede elevação (UAC).
pub fn open(target: &str, args: &str, admin: bool) -> Result<(), String> {
    let verb = HSTRING::from(if admin { "runas" } else { "open" });
    let file = HSTRING::from(target);
    let params = HSTRING::from(args);
    // O Shell pede COM inicializado na thread que chama.
    let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let code = unsafe {
        ShellExecuteW(
            None,
            &verb,
            &file,
            if args.is_empty() { PCWSTR::null() } else { PCWSTR(params.as_ptr()) },
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if com.is_ok() {
        unsafe { CoUninitialize() };
    }
    match launch_error_message(code.0 as isize) {
        None => Ok(()),
        Some(msg) => Err(msg),
    }
}

/// Abre o Explorer com o item selecionado.
pub fn reveal(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{path}\""))
        .spawn()
        .map(|_| ())
        .map_err(|_| "Não consegui abrir o local do arquivo.".to_string())
}
