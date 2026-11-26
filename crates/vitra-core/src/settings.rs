//! Configurações do Vitra, gravadas em JSON com backup da versão anterior.

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::items::normalize_url;
use crate::store;

/// Cores de destaque permitidas (roxo, verde-água, laranja, azul).
pub const ACCENTS: [&str; 4] = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"];

/// Palavra-chave de pesquisa: `yt lofi` → YouTube com "lofi".
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WebShortcut {
    pub keyword: String,
    pub name: String,
    /// Endereço com `{q}` onde entra a pesquisa.
    pub url: String,
}

fn shortcut(keyword: &str, name: &str, url: &str) -> WebShortcut {
    WebShortcut { keyword: keyword.into(), name: name.into(), url: url.into() }
}

pub fn default_shortcuts() -> Vec<WebShortcut> {
    vec![
        shortcut("g", "Google", "https://www.google.com/search?q={q}"),
        shortcut("yt", "YouTube", "https://www.youtube.com/results?search_query={q}"),
        shortcut("w", "Wikipédia", "https://pt.wikipedia.org/w/index.php?search={q}"),
        shortcut("m", "Google Maps", "https://www.google.com/maps/search/{q}"),
    ]
}

/// Valida uma palavra-chave nova contra as que já existem (`others`).
pub fn validate_shortcut(s: &WebShortcut, others: &[WebShortcut]) -> Result<WebShortcut, String> {
    let keyword = s.keyword.trim().to_lowercase();
    if keyword.is_empty() || keyword.chars().count() > 10 || !keyword.chars().all(char::is_alphanumeric) {
        return Err("Use de 1 a 10 letras ou números, sem espaço.".into());
    }
    let name = s.name.trim();
    if name.is_empty() {
        return Err("Dê um nome.".into());
    }
    if others.iter().any(|o| o.keyword.eq_ignore_ascii_case(&keyword)) {
        return Err("Essa palavra-chave já existe.".into());
    }
    if !s.url.contains("{q}") {
        return Err("O endereço precisa ter {q} onde entra a pesquisa.".into());
    }
    const MARK: &str = "vitraq0";
    let url = normalize_url(&s.url.replace("{q}", MARK))
        .map_err(|e| e.to_string())?
        .replace(MARK, "{q}");
    Ok(WebShortcut { keyword, name: name.to_string(), url })
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub hotkey: String,
    pub accent: String,
    pub autostart: bool,
    pub web_shortcuts: Vec<WebShortcut>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            hotkey: "Alt+Space".into(),
            accent: ACCENTS[0].into(),
            autostart: true,
            web_shortcuts: default_shortcuts(),
        }
    }
}

/// Lê as configurações. Se o arquivo faltar ou estiver corrompido, tenta o
/// backup `.bak`; se nada servir, devolve os padrões. Nunca falha.
pub fn load(path: &Path) -> Settings {
    let mut s: Settings = store::load_json(path).unwrap_or_default();
    if !ACCENTS.contains(&s.accent.as_str()) {
        s.accent = ACCENTS[0].into();
    }
    s
}

/// Grava as configurações de forma atômica, guardando a versão anterior em `.bak`.
pub fn save(path: &Path, s: &Settings) -> std::io::Result<()> {
    store::save_json(path, s)
}

/// O que `save_settings` precisa fazer ao trocar `current` por `next`.
#[derive(Debug, PartialEq)]
pub struct SavePlan {
    /// Tentar registrar o atalho de `next`.
    pub register_hotkey: bool,
    /// Se o registro falhar, a gravação toda é recusada (só quando o usuário trocou o atalho).
    pub hotkey_required: bool,
    /// Novo valor de "abrir com o Windows", se mudou.
    pub autostart: Option<bool>,
}

/// `hotkey_failing`: o atalho atual não pôde ser registrado (ex.: em uso por outro programa).
/// Nesse caso tentamos de novo, mas sem impedir que as outras preferências sejam salvas.
pub fn plan_save(current: &Settings, next: &Settings, hotkey_failing: bool) -> SavePlan {
    let changed = current.hotkey != next.hotkey;
    SavePlan {
        register_hotkey: changed || hotkey_failing,
        hotkey_required: changed,
        autostart: (current.autostart != next.autostart).then_some(next.autostart),
    }
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
            web_shortcuts: default_shortcuts(),
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

    #[test]
    fn plan_save_accent_only_touches_nothing_else() {
        let cur = Settings::default();
        let next = Settings { accent: "#ff8a4c".into(), ..cur.clone() };
        assert_eq!(
            plan_save(&cur, &next, false),
            SavePlan { register_hotkey: false, hotkey_required: false, autostart: None }
        );
    }

    #[test]
    fn plan_save_retries_failing_hotkey_without_blocking() {
        let cur = Settings::default();
        let next = Settings { accent: "#ff8a4c".into(), ..cur.clone() };
        assert_eq!(
            plan_save(&cur, &next, true),
            SavePlan { register_hotkey: true, hotkey_required: false, autostart: None }
        );
    }

    #[test]
    fn plan_save_changed_hotkey_is_required() {
        let cur = Settings::default();
        let next = Settings { hotkey: "Ctrl+K".into(), ..cur.clone() };
        let plan = plan_save(&cur, &next, true);
        assert!(plan.register_hotkey && plan.hotkey_required);
    }

    #[test]
    fn plan_save_autostart_toggle() {
        let cur = Settings::default();
        let next = Settings { autostart: false, ..cur.clone() };
        assert_eq!(plan_save(&cur, &next, false).autostart, Some(false));
    }

    fn sc(k: &str, n: &str, u: &str) -> WebShortcut {
        WebShortcut { keyword: k.into(), name: n.into(), url: u.into() }
    }

    #[test]
    fn settings_default_has_web_shortcuts() {
        let kws: Vec<String> = Settings::default().web_shortcuts.into_iter().map(|s| s.keyword).collect();
        assert_eq!(kws, vec!["g", "yt", "w", "m"]);
    }

    #[test]
    fn old_settings_get_default_shortcuts() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        fs::write(&p, r##"{"version":1,"hotkey":"Ctrl+K","accent":"#9b82ff","autostart":true}"##).unwrap();
        let s = load(&p);
        assert_eq!(s.hotkey, "Ctrl+K");
        assert_eq!(s.web_shortcuts, default_shortcuts());
    }

    #[test]
    fn validate_shortcut_accepts_and_normalizes() {
        let ok = validate_shortcut(&sc(" GH ", " GitHub ", "github.com/search?q={q}"), &default_shortcuts());
        assert_eq!(ok, Ok(sc("gh", "GitHub", "https://github.com/search?q={q}")));
    }

    #[test]
    fn validate_shortcut_rejects_bad_keyword() {
        let msg = Err("Use de 1 a 10 letras ou números, sem espaço.".to_string());
        assert_eq!(validate_shortcut(&sc("", "X", "a.com?q={q}"), &[]), msg);
        assert_eq!(validate_shortcut(&sc("g h", "X", "a.com?q={q}"), &[]), msg);
        assert_eq!(validate_shortcut(&sc("abcdefghijk", "X", "a.com?q={q}"), &[]), msg);
        assert_eq!(validate_shortcut(&sc("g", " ", "a.com?q={q}"), &[]), Err("Dê um nome.".into()));
    }

    #[test]
    fn validate_shortcut_rejects_duplicate() {
        assert_eq!(
            validate_shortcut(&sc("YT", "Outro", "a.com?q={q}"), &default_shortcuts()),
            Err("Essa palavra-chave já existe.".into())
        );
    }

    #[test]
    fn validate_shortcut_rejects_url_without_q_or_bad_scheme() {
        assert_eq!(
            validate_shortcut(&sc("x", "X", "https://a.com"), &[]),
            Err("O endereço precisa ter {q} onde entra a pesquisa.".into())
        );
        assert_eq!(
            validate_shortcut(&sc("x", "X", "javascript:alert({q})"), &[]),
            Err("Endereço inválido. Ex.: youtube.com".into())
        );
    }
}
