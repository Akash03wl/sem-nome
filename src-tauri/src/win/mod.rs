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
pub use apps::discover;
#[cfg(windows)]
pub use icons::icon_png;
#[cfg(windows)]
pub use launch::{open, reveal};

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
}

#[cfg(not(windows))]
pub use fallback::{discover, icon_png, open, reveal};
