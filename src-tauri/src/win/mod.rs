//! Partes que só existem no Windows: descobrir apps, extrair ícones e abrir itens.
//! Em outros sistemas, versões vazias deixam o resto do app compilar.

use serde::Serialize;

/// Um app do Menu Iniciar ou da Store.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Discovered {
    pub id: String,
    pub name: String,
    /// `shell:AppsFolder\<nome de análise>`
    pub target: String,
}

#[cfg(windows)]
mod apps;
#[cfg(windows)]
mod icons;
#[cfg(windows)]
mod launch;
#[cfg(windows)]
pub mod everything;
#[cfg(windows)]
mod system;

#[cfg(windows)]
pub use apps::discover;
#[cfg(windows)]
pub use icons::icon_png;
#[cfg(windows)]
pub use launch::{open, reveal};
#[cfg(windows)]
pub use system::run_system;

#[cfg(not(windows))]
mod fallback {
    use super::Discovered;
    const ONLY_WINDOWS: &str = "Disponível só no Windows.";

    pub fn discover() -> Vec<Discovered> {
        Vec::new()
    }
    pub fn icon_png(_target: &str, _size: i32) -> Option<Vec<u8>> {
        None
    }
    pub fn open(_target: &str, _args: &str, _admin: bool) -> Result<(), String> {
        Err(ONLY_WINDOWS.into())
    }
    pub fn reveal(_path: &str) -> Result<(), String> {
        Err(ONLY_WINDOWS.into())
    }
    pub fn run_system(_cmd: vitra_core::system::SystemCommand) -> Result<(), String> {
        Err(ONLY_WINDOWS.into())
    }
}

#[cfg(not(windows))]
pub use fallback::{discover, icon_png, open, reveal, run_system};

/// Fora do Windows não existe Everything: tudo responde "não disponível".
#[cfg(not(windows))]
pub mod everything {
    use std::path::Path;
    use vitra_core::files::FileHit;

    pub struct Everything;

    impl Everything {
        pub fn load(_dll_path: &Path) -> Option<Everything> {
            None
        }
        pub fn probe(&self) -> Option<u32> {
            None
        }
        pub fn search(&self, _text: &str, _max: u32) -> Result<Vec<FileHit>, u32> {
            Ok(Vec::new())
        }
    }

    pub fn installed() -> bool {
        false
    }
    pub fn start() -> Result<(), String> {
        Err("Disponível só no Windows.".into())
    }
    pub fn install() -> Result<(), String> {
        Err("Disponível só no Windows.".into())
    }
}
