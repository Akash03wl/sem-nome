//! Busca de arquivos pelo Everything: tipos e regras que não dependem do Windows.

use serde::Serialize;
use std::path::Path;

use crate::items::{display_name, last_segment};

/// Um arquivo ou pasta achado pelo Everything.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EverythingStatus {
    Ready,
    NotRunning,
    NotInstalled,
    DllMissing,
}

/// Código de erro do SDK quando o Everything não responde (não está aberto).
pub const EVERYTHING_ERROR_IPC: u32 = 2;

/// Junta o que se sabe (DLL carregou? último erro? `Everything.exe` existe?) num status.
pub fn status_from(dll_loaded: bool, last_error: Option<u32>, installed: bool) -> EverythingStatus {
    match (dll_loaded, last_error) {
        (false, _) => EverythingStatus::DllMissing,
        (true, Some(EVERYTHING_ERROR_IPC)) if installed => EverythingStatus::NotRunning,
        (true, Some(EVERYTHING_ERROR_IPC)) => EverythingStatus::NotInstalled,
        _ => EverythingStatus::Ready,
    }
}

pub fn status_message(s: EverythingStatus) -> Option<&'static str> {
    match s {
        EverythingStatus::Ready => None,
        EverythingStatus::NotRunning => Some("O Everything está fechado."),
        EverythingStatus::NotInstalled => Some("Instale o Everything para buscar arquivos do PC."),
        EverythingStatus::DllMissing => Some("DLL do Everything não encontrada."),
    }
}

/// O nome mostra a extensão (arquivos parecidos se diferenciam por ela); raiz de disco vira "Disco D:".
pub fn file_hit(path: &str, is_dir: bool) -> FileHit {
    let p = Path::new(path);
    let seg = last_segment(p);
    let name = if seg.len() == 2 && seg.ends_with(':') { display_name(p) } else { seg };
    FileHit { name, path: path.to_string(), is_dir }
}

/// O winget terminou bem? "Já instalado" e "nada para atualizar" também contam.
pub fn winget_succeeded(exit_code: i32) -> bool {
    const ALREADY_INSTALLED: u32 = 0x8A15_002B;
    const NO_APPLICABLE_UPGRADE: u32 = 0x8A15_0061;
    matches!(exit_code as u32, 0 | ALREADY_INSTALLED | NO_APPLICABLE_UPGRADE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use EverythingStatus::*;

    #[test]
    fn everything_status_from_codes() {
        assert_eq!(status_from(false, None, true), DllMissing);
        assert_eq!(status_from(true, None, true), Ready);
        assert_eq!(status_from(true, Some(0), true), Ready);
        assert_eq!(status_from(true, Some(EVERYTHING_ERROR_IPC), true), NotRunning);
        assert_eq!(status_from(true, Some(EVERYTHING_ERROR_IPC), false), NotInstalled);
    }

    #[test]
    fn status_messages() {
        assert_eq!(status_message(Ready), None);
        assert_eq!(status_message(NotRunning), Some("O Everything está fechado."));
        assert_eq!(status_message(NotInstalled), Some("Instale o Everything para buscar arquivos do PC."));
        assert_eq!(status_message(DllMissing), Some("DLL do Everything não encontrada."));
    }

    #[test]
    fn file_hit_name_from_path() {
        assert_eq!(file_hit("C:\\Users\\Ana\\Música\\aula 1.mp3", false).name, "aula 1.mp3");
        assert_eq!(file_hit("C:\\Users\\Ana\\Faculdade", true).name, "Faculdade");
        assert_eq!(file_hit("D:\\", true).name, "Disco D:");
    }

    #[test]
    fn file_hit_serializes_camel_case() {
        let json = serde_json::to_string(&file_hit("C:\\x", true)).unwrap();
        assert!(json.contains("\"isDir\":true"), "{json}");
        assert_eq!(serde_json::to_string(&NotRunning).unwrap(), "\"notRunning\"");
    }

    #[test]
    fn winget_already_installed_counts_as_success() {
        assert!(winget_succeeded(0));
        assert!(winget_succeeded(0x8A15_002Bu32 as i32)); // já instalado
        assert!(winget_succeeded(0x8A15_0061u32 as i32)); // nenhuma atualização aplicável
        assert!(!winget_succeeded(1));
        assert!(!winget_succeeded(0x8A15_0014u32 as i32)); // pacote não encontrado
    }
}
