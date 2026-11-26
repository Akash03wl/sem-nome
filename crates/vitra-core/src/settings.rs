//! Configurações do Vitra, gravadas em JSON com backup da versão anterior.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Cores de destaque permitidas (roxo, verde-água, laranja, azul).
pub const ACCENTS: [&str; 4] = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub hotkey: String,
    pub accent: String,
    pub autostart: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            hotkey: "Alt+Space".into(),
            accent: ACCENTS[0].into(),
            autostart: true,
        }
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn read(path: &Path) -> Option<Settings> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Lê as configurações. Se o arquivo faltar ou estiver corrompido, tenta o
/// backup `.bak`; se nada servir, devolve os padrões. Nunca falha.
pub fn load(path: &Path) -> Settings {
    let mut s = read(path)
        .or_else(|| read(&with_suffix(path, ".bak")))
        .unwrap_or_default();
    if !ACCENTS.contains(&s.accent.as_str()) {
        s.accent = ACCENTS[0].into();
    }
    s
}

/// Grava as configurações de forma atômica, guardando a versão anterior em `.bak`.
pub fn save(path: &Path, s: &Settings) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if path.exists() {
        fs::copy(path, with_suffix(path, ".bak"))?;
    }
    let tmp = with_suffix(path, ".tmp");
    let json = serde_json::to_string_pretty(s).map_err(std::io::Error::other)?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn custom() -> Settings {
        Settings {
            version: 1,
            hotkey: "Ctrl+Space".into(),
            accent: "#3fd0c9".into(),
            autostart: false,
        }
    }

    #[test]
    fn load_missing_file_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(&dir.path().join("settings.json")), Settings::default());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        save(&p, &custom()).unwrap();
        assert_eq!(load(&p), custom());
    }

    #[test]
    fn save_creates_parent_dir() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Vitra").join("settings.json");
        save(&p, &custom()).unwrap();
        assert!(p.exists());
    }

    #[test]
    fn save_keeps_previous_version_as_bak() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        let a = custom();
        let b = Settings { hotkey: "Ctrl+K".into(), ..custom() };
        save(&p, &a).unwrap();
        save(&p, &b).unwrap();
        let bak: Settings =
            serde_json::from_str(&fs::read_to_string(dir.path().join("settings.json.bak")).unwrap())
                .unwrap();
        assert_eq!(bak, a);
        assert_eq!(load(&p), b);
    }

    #[test]
    fn load_partial_file_fills_missing_fields() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        fs::write(&p, r#"{"hotkey":"Ctrl+K"}"#).unwrap();
        let s = load(&p);
        assert_eq!(s.hotkey, "Ctrl+K");
        assert_eq!(s.accent, "#9b82ff");
        assert!(s.autostart);
    }

    #[test]
    fn load_corrupt_file_falls_back_to_bak() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        fs::write(&p, "{oops").unwrap();
        fs::write(dir.path().join("settings.json.bak"), r#"{"hotkey":"Ctrl+K"}"#).unwrap();
        assert_eq!(load(&p).hotkey, "Ctrl+K");
    }

    #[test]
    fn load_corrupt_file_and_no_bak_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        fs::write(&p, "{oops").unwrap();
        assert_eq!(load(&p), Settings::default());
    }

    #[test]
    fn load_invalid_accent_resets_to_default() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        fs::write(&p, r##"{"accent":"#123456"}"##).unwrap();
        assert_eq!(load(&p).accent, "#9b82ff");
    }
}
