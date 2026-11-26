//! Abre itens com o Shell do Windows.

use std::process::Command;

use vitra_core::items::launch_error_message;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// Abre um programa, pasta, arquivo ou site. `admin` pede elevação (UAC).
/// Sem caixas de erro do próprio Windows: o Vitra mostra a mensagem dele.
pub fn open(target: &str, args: &str, admin: bool) -> Result<(), String> {
    let verb = HSTRING::from(if admin { "runas" } else { "open" });
    let file = HSTRING::from(target);
    let params = HSTRING::from(args);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: if args.is_empty() { PCWSTR::null() } else { PCWSTR(params.as_ptr()) },
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    // O Shell pede COM inicializado na thread que chama.
    let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let result = unsafe { ShellExecuteExW(&mut info) };
    if com.is_ok() {
        unsafe { CoUninitialize() };
    }
    result.map_err(|e| {
        // HRESULT de erro Win32 → código: 2/3 não encontrado, 5/1223 cancelado.
        let code = match e.code().0 as u32 & 0xFFFF {
            2 | 3 => 2,
            5 | 1223 => 5,
            _ => 31,
        };
        launch_error_message(code).unwrap_or_else(|| "Não consegui abrir este item.".into())
    })
}

/// Abre o Explorer com o item selecionado.
pub fn reveal(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // "D:\" viraria "D:\"" na linha de comando; sem a barra final não há ambiguidade.
    let path = path.trim_end_matches('\\');
    Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{path}\""))
        .spawn()
        .map(|_| ())
        .map_err(|_| "Não consegui abrir o local do arquivo.".to_string())
}
