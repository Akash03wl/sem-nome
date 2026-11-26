//! Regras sobre itens: o que esconder do Menu Iniciar, tipo de cada caminho,
//! endereços de sites, ids estáveis e mensagens de erro ao abrir.

use std::fmt;
use std::path::Path;

use crate::library::ItemKind;

/// Palavras que indicam entradas do Menu Iniciar que ninguém quer abrir.
const JUNK: [&str; 17] = [
    "uninstall", "desinstal", "readme", "read me", "leia-me", "leiame", "help", "ajuda",
    "documentation", "documentação", "manual", "website", "release notes", "license",
    "licença", "what's new", "novidades",
];

pub fn is_junk(name: &str) -> bool {
    let lower = name.to_lowercase();
    JUNK.iter().any(|j| lower.contains(j))
}

const APP_EXTS: [&str; 7] = ["exe", "lnk", "bat", "cmd", "msc", "url", "appref-ms"];

/// Último pedaço de um caminho do Windows (aceita `\` e `/`, em qualquer sistema).
fn last_segment(path: &Path) -> String {
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches(['\\', '/']);
    trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed).to_string()
}

fn split_ext(name: &str) -> (&str, Option<String>) {
    match name.rsplit_once('.') {
        Some((stem, ext))
            if !stem.is_empty() && (1..=9).contains(&ext.len()) && !ext.contains(' ') =>
        {
            (stem, Some(ext.to_lowercase()))
        }
        _ => (name, None),
    }
}

pub fn classify_path(path: &Path, is_dir: bool) -> ItemKind {
    if is_dir {
        return ItemKind::Folder;
    }
    match split_ext(&last_segment(path)).1 {
        Some(ext) if APP_EXTS.contains(&ext.as_str()) => ItemKind::App,
        _ => ItemKind::File,
    }
}

pub fn display_name(path: &Path) -> String {
    let seg = last_segment(path);
    let b = seg.as_bytes();
    if b.len() == 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        return format!("Disco {}:", (b[0] as char).to_ascii_uppercase());
    }
    split_ext(&seg).0.to_string()
}

#[derive(Debug, PartialEq)]
pub struct UrlError;

impl fmt::Display for UrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Endereço inválido. Ex.: youtube.com")
    }
}

impl std::error::Error for UrlError {}

pub fn normalize_url(input: &str) -> Result<String, UrlError> {
    let s = input.trim();
    if s.is_empty() || s.chars().any(char::is_whitespace) {
        return Err(UrlError);
    }
    let url = match s.split_once("://") {
        Some((scheme, _)) if scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https") => {
            s.to_string()
        }
        Some(_) => return Err(UrlError),
        None => format!("https://{s}"),
    };
    let host_port = host_port(&url);
    let (host, port) = match host_port.rsplit_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (host_port, None),
    };
    if let Some(p) = port {
        if p.is_empty() || !p.chars().all(|c| c.is_ascii_digit()) {
            return Err(UrlError);
        }
    }
    let host_ok = host.eq_ignore_ascii_case("localhost")
        || (host.contains('.')
            && !host.starts_with('.')
            && !host.ends_with('.')
            && host.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-'));
    if !host_ok {
        return Err(UrlError);
    }
    Ok(url)
}

/// `"https://www.a.com:80/x?y"` → `"www.a.com:80"`.
fn host_port(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let hp = &rest[..end];
    hp.rsplit_once('@').map_or(hp, |(_, h)| h)
}

fn fnv1a64(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Id estável: o mesmo alvo sempre gera o mesmo id (sem diferenciar maiúsculas).
pub fn item_id(kind: ItemKind, target: &str) -> String {
    let prefix = match kind {
        ItemKind::App => "app",
        ItemKind::Folder => "dir",
        ItemKind::File => "file",
        ItemKind::Site => "site",
    };
    format!("{prefix}-{:016x}", fnv1a64(&target.to_lowercase()))
}

pub fn site_name(url: &str) -> String {
    let host = host_port(url).split(':').next().unwrap_or_default().to_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let base = match host.rsplit_once('.') {
        Some((b, _)) => b,
        None => host,
    };
    let mut chars = base.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// Mensagem para o retorno de `ShellExecuteW` (> 32 = deu certo).
pub fn launch_error_message(code: isize) -> Option<String> {
    let msg = match code {
        c if c > 32 => return None,
        2 | 3 => "Não encontrei este item. Ele foi movido ou apagado?",
        5 => "Abertura cancelada.",
        _ => "Não consegui abrir este item.",
    };
    Some(msg.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn is_junk_matches_common_entries() {
        for n in ["Uninstall Steam", "Desinstalar X", "Leia-me", "Ajuda do Office", "Website", "Release Notes"] {
            assert!(is_junk(n), "{n}");
        }
    }

    #[test]
    fn is_junk_keeps_real_apps() {
        for n in ["Steam", "Spotify", "Microsoft Edge", "Discord", "Visual Studio Code"] {
            assert!(!is_junk(n), "{n}");
        }
    }

    #[test]
    fn classify_path_kinds() {
        assert_eq!(classify_path(Path::new("C:\\Faculdade"), true), ItemKind::Folder);
        assert_eq!(classify_path(Path::new("C:\\a.EXE"), false), ItemKind::App);
        assert_eq!(classify_path(Path::new("C:\\b.lnk"), false), ItemKind::App);
        assert_eq!(classify_path(Path::new("C:\\c.pdf"), false), ItemKind::File);
        assert_eq!(classify_path(Path::new("C:\\semext"), false), ItemKind::File);
    }

    #[test]
    fn display_name_strips_extension() {
        assert_eq!(display_name(&PathBuf::from("C:/x/Steam.lnk")), "Steam");
        assert_eq!(display_name(&PathBuf::from("C:/Faculdade")), "Faculdade");
        assert_eq!(display_name(&PathBuf::from("D:\\")), "Disco D:");
        assert_eq!(display_name(&PathBuf::from("D:")), "Disco D:");
    }

    #[test]
    fn normalize_url_adds_https() {
        assert_eq!(normalize_url("  youtube.com "), Ok("https://youtube.com".into()));
        assert_eq!(normalize_url("https://g.co/x?y=1"), Ok("https://g.co/x?y=1".into()));
    }

    #[test]
    fn normalize_url_keeps_http() {
        assert_eq!(normalize_url("http://localhost:3000"), Ok("http://localhost:3000".into()));
    }

    #[test]
    fn normalize_url_rejects_bad() {
        for bad in ["", "javascript:alert(1)", "file:///C:/x", "abc", "you tube.com", "https://", "ftp://a.com"] {
            assert_eq!(normalize_url(bad), Err(UrlError), "{bad}");
        }
    }

    #[test]
    fn item_id_is_stable_and_case_insensitive() {
        let a = item_id(ItemKind::App, "C:\\A.exe");
        assert_eq!(a, item_id(ItemKind::App, "c:\\a.EXE"));
        assert!(a.starts_with("app-"));
        assert_eq!(a.len(), 20);
        assert_ne!(a, item_id(ItemKind::App, "C:\\B.exe"));
        assert!(item_id(ItemKind::Folder, "C:\\x").starts_with("dir-"));
        assert!(item_id(ItemKind::Site, "https://a.com").starts_with("site-"));
    }

    #[test]
    fn site_name_from_url() {
        assert_eq!(site_name("https://www.youtube.com/x"), "Youtube");
        assert_eq!(site_name("https://mail.google.com"), "Mail.google");
        assert_eq!(site_name("http://localhost:3000"), "Localhost");
    }

    #[test]
    fn launch_missing_path_returns_friendly_error() {
        let msg = Some("Não encontrei este item. Ele foi movido ou apagado?".to_string());
        assert_eq!(launch_error_message(2), msg);
        assert_eq!(launch_error_message(3), msg);
    }

    #[test]
    fn launch_access_denied_is_cancelled() {
        assert_eq!(launch_error_message(5), Some("Abertura cancelada.".into()));
    }

    #[test]
    fn launch_other_error_is_generic() {
        assert_eq!(launch_error_message(31), Some("Não consegui abrir este item.".into()));
    }

    #[test]
    fn launch_success_is_none() {
        assert_eq!(launch_error_message(42), None);
    }
}
