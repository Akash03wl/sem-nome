//! Comandos do PC: desligar, reiniciar, suspender, bloquear, sair e esvaziar a lixeira.

use std::os::windows::process::CommandExt;
use std::process::Command;

use vitra_core::system::SystemCommand;
use windows::core::PCWSTR;
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::LockWorkStation;
use windows::Win32::UI::Shell::{
    SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
};

/// Não pisca uma janela de console ao chamar `shutdown.exe`.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// A lixeira já vazia devolve E_UNEXPECTED: para o usuário, deu certo.
const E_UNEXPECTED: i32 = 0x8000_FFFFu32 as i32;

fn shutdown_exe(args: &[&str]) -> Result<(), String> {
    Command::new("shutdown.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Não consegui executar o comando.".to_string())
}

pub fn run_system(cmd: SystemCommand) -> Result<(), String> {
    let failed = || format!("Não consegui {}.", cmd.label().to_lowercase());
    match cmd {
        SystemCommand::Shutdown => shutdown_exe(&["/s", "/t", "0"]),
        SystemCommand::Restart => shutdown_exe(&["/r", "/t", "0"]),
        SystemCommand::Logoff => shutdown_exe(&["/l"]),
        SystemCommand::Lock => unsafe { LockWorkStation() }.map_err(|_| failed()),
        SystemCommand::Sleep => {
            if unsafe { SetSuspendState(false, false, false) } {
                Ok(())
            } else {
                Err(failed())
            }
        }
        SystemCommand::EmptyRecycleBin => {
            let flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND;
            match unsafe { SHEmptyRecycleBinW(None, PCWSTR::null(), flags) } {
                Ok(()) => Ok(()),
                Err(e) if e.code().0 == E_UNEXPECTED => Ok(()),
                Err(_) => Err(failed()),
            }
        }
    }
}
