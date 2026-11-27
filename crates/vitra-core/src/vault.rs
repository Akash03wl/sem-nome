//! Cofre de senhas (Bitwarden): interpretar a CLI `bw` e as regras de segurança.
//! Os segredos ficam em `VaultSecret` (zerado ao sair da memória); o frontend só vê `VaultEntry`.

use serde::{Deserialize, Serialize};
use std::fmt;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum VaultStatus {
    /// A CLI do Bitwarden não está instalada.
    Missing,
    Unauthenticated,
    Locked,
    Unlocked,
}

/// Uma conta do cofre, com segredos. Nunca sai do Rust.
#[derive(Clone, Debug, PartialEq, Zeroize, ZeroizeOnDrop)]
pub struct VaultSecret {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub totp: bool,
    pub uri: Option<String>,
}

/// O que o frontend pode ver de uma conta: sem senha.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    pub has_password: bool,
    pub has_totp: bool,
    pub uri: Option<String>,
}

impl VaultSecret {
    pub fn entry(&self) -> VaultEntry {
        VaultEntry {
            id: self.id.clone(),
            name: self.name.clone(),
            username: self.username.clone(),
            has_password: self.password.is_some(),
            has_totp: self.totp,
            uri: self.uri.clone(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusJson {
    status: String,
    user_email: Option<String>,
}

/// Lê a saída de `bw status`: o estado do cofre e o e-mail da conta.
pub fn parse_status(json: &str) -> Option<(VaultStatus, Option<String>)> {
    let s: StatusJson = serde_json::from_str(json.trim()).ok()?;
    let status = match s.status.as_str() {
        "unauthenticated" => VaultStatus::Unauthenticated,
        "locked" => VaultStatus::Locked,
        "unlocked" => VaultStatus::Unlocked,
        _ => return None,
    };
    Some((status, s.user_email))
}

/// Tipo 1 do Bitwarden = login (os outros são notas, cartões, identidades).
const LOGIN_TYPE: u64 = 1;

fn non_empty(v: &serde_json::Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// Lê a saída de `bw list items`: só logins, com o 1º site http(s), em ordem de nome.
pub fn parse_items(json: &str) -> Result<Vec<VaultSecret>, String> {
    let all: Vec<serde_json::Value> =
        serde_json::from_str(json).map_err(|_| "Resposta inesperada do Bitwarden.".to_string())?;
    let mut out: Vec<VaultSecret> = all
        .iter()
        .filter(|v| v["type"].as_u64() == Some(LOGIN_TYPE))
        .map(|v| {
            let login = &v["login"];
            let uri = login["uris"].as_array().and_then(|uris| {
                uris.iter()
                    .filter_map(|u| non_empty(&u["uri"]))
                    .find(|u| u.starts_with("http://") || u.starts_with("https://"))
            });
            VaultSecret {
                id: v["id"].as_str().unwrap_or_default().to_string(),
                name: non_empty(&v["name"]).unwrap_or_else(|| "(sem nome)".into()),
                username: non_empty(&login["username"]),
                password: non_empty(&login["password"]),
                totp: non_empty(&login["totp"]).is_some(),
                uri,
            }
        })
        .collect();
    out.sort_by_key(|i| i.name.to_lowercase());
    Ok(out)
}

#[derive(Debug, PartialEq)]
pub enum LoginError {
    WrongPassword,
    TwoFactorRequired,
    InvalidCode,
    NoInternet,
    Other(String),
}

impl fmt::Display for LoginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LoginError::WrongPassword => f.write_str("Senha mestra incorreta."),
            LoginError::TwoFactorRequired => f.write_str("Digite o código de verificação (2FA)."),
            LoginError::InvalidCode => f.write_str("Código de verificação inválido."),
            LoginError::NoInternet => f.write_str("Sem conexão com o Bitwarden. Verifique a internet."),
            LoginError::Other(msg) => f.write_str(msg),
        }
    }
}

/// Traduz o erro da CLI `bw login`/`bw unlock` para uma mensagem clara.
pub fn classify_login_error(stderr: &str) -> LoginError {
    let lower = stderr.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| lower.contains(w));
    if has(&["invalid master password", "username or password is incorrect"]) {
        return LoginError::WrongPassword;
    }
    if lower.contains("invalid") && has(&["code", "token"]) {
        return LoginError::InvalidCode;
    }
    if has(&["two-step", "two factor", "two-factor", "2fa"]) {
        return LoginError::TwoFactorRequired;
    }
    if has(&["econnrefused", "enotfound", "fetch failed", "network", "etimedout"]) {
        return LoginError::NoInternet;
    }
    let first = stderr.lines().map(str::trim).find(|l| !l.is_empty());
    LoginError::Other(first.unwrap_or("Não consegui entrar no Bitwarden.").to_string())
}

/// Travar o cofre? (`minutes` sem uso).
pub fn should_lock(last_used_secs_ago: u64, minutes: u32) -> bool {
    last_used_secs_ago >= u64::from(minutes) * 60
}

/// Apagar a área de transferência? Só se ainda tiver o que o Vitra escreveu.
pub fn should_clear_clipboard(current: &str, written: &str) -> bool {
    !written.is_empty() && current == written
}

#[cfg(test)]
mod tests {
    use super::*;

    const ITEMS: &str = r#"[
      {"id":"2","type":1,"name":"YouTube","login":{"username":"ana@x.com","password":"s3nh@","totp":null,"uris":[{"uri":"android://x"},{"uri":"https://youtube.com"}]}},
      {"id":"1","type":1,"name":"Banco","login":{"username":"ana","password":"p","totp":"otpauth://x","uris":[]}},
      {"id":"3","type":2,"name":"Nota secreta","secureNote":{"type":0},"notes":"x"},
      {"id":"4","type":1,"name":"Só usuário","login":{"username":"bob","password":null}},
      {"id":"5","type":1,"name":"Vazio"}
    ]"#;

    #[test]
    fn parse_status_reads_states_and_email() {
        assert_eq!(
            parse_status(r#"{"serverUrl":null,"userEmail":"ana@x.com","status":"locked"}"#),
            Some((VaultStatus::Locked, Some("ana@x.com".into())))
        );
        assert_eq!(parse_status(r#"{"status":"unlocked","userEmail":"a@b.c"}"#).unwrap().0, VaultStatus::Unlocked);
        assert_eq!(parse_status(r#"{"status":"unauthenticated"}"#), Some((VaultStatus::Unauthenticated, None)));
    }

    #[test]
    fn parse_status_rejects_garbage() {
        assert_eq!(parse_status("Not JSON"), None);
        assert_eq!(parse_status(r#"{"status":"weird"}"#), None);
    }

    #[test]
    fn parse_items_maps_login_fields() {
        let items = parse_items(ITEMS).unwrap();
        let yt = items.iter().find(|i| i.id == "2").unwrap();
        assert_eq!(yt.username.as_deref(), Some("ana@x.com"));
        assert_eq!(yt.password.as_deref(), Some("s3nh@"));
        assert!(!yt.totp);
        assert_eq!(yt.uri.as_deref(), Some("https://youtube.com"));
        assert!(items.iter().find(|i| i.id == "1").unwrap().totp);
        let names: Vec<&str> = items.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(names, vec!["Banco", "Só usuário", "Vazio", "YouTube"]);
    }

    #[test]
    fn parse_items_skips_non_logins_and_missing_fields() {
        let items = parse_items(ITEMS).unwrap();
        assert!(items.iter().all(|i| i.id != "3"));
        let only_user = items.iter().find(|i| i.id == "4").unwrap();
        assert_eq!(only_user.password, None);
        let empty = items.iter().find(|i| i.id == "5").unwrap();
        assert_eq!((empty.username.clone(), empty.password.clone(), empty.uri.clone()), (None, None, None));
        assert!(parse_items("oops").is_err());
    }

    #[test]
    fn entry_has_no_secrets() {
        let items = parse_items(ITEMS).unwrap();
        let yt = items.iter().find(|i| i.id == "2").unwrap();
        let json = serde_json::to_string(&yt.entry()).unwrap();
        assert!(!json.contains("s3nh@"), "{json}");
        assert!(json.contains("\"hasPassword\":true"), "{json}");
        assert!(json.contains("\"hasTotp\":false"), "{json}");
    }

    #[test]
    fn classify_login_error_wrong_password() {
        assert_eq!(classify_login_error("Invalid master password."), LoginError::WrongPassword);
        assert_eq!(classify_login_error("Username or password is incorrect. Try again."), LoginError::WrongPassword);
    }

    #[test]
    fn classify_login_error_two_factor() {
        assert_eq!(classify_login_error("Two-step login is required"), LoginError::TwoFactorRequired);
        assert_eq!(classify_login_error("Code is required. Two factor"), LoginError::TwoFactorRequired);
    }

    #[test]
    fn classify_login_error_invalid_code() {
        assert_eq!(classify_login_error("Invalid two-step code."), LoginError::InvalidCode);
        assert_eq!(classify_login_error("invalid token"), LoginError::InvalidCode);
    }

    #[test]
    fn classify_login_error_network() {
        assert_eq!(classify_login_error("FetchError: request failed, reason: getaddrinfo ENOTFOUND"), LoginError::NoInternet);
        assert_eq!(classify_login_error("fetch failed"), LoginError::NoInternet);
    }

    #[test]
    fn classify_login_error_other_first_line() {
        assert_eq!(classify_login_error("Something odd\nstack trace"), LoginError::Other("Something odd".into()));
        assert_eq!(classify_login_error("   "), LoginError::Other("Não consegui entrar no Bitwarden.".into()));
    }

    #[test]
    fn should_lock_after_timeout() {
        assert!(!should_lock(299, 5));
        assert!(should_lock(300, 5));
        assert!(should_lock(61, 1));
    }

    #[test]
    fn should_clear_clipboard_only_if_unchanged() {
        assert!(should_clear_clipboard("s3nh@", "s3nh@"));
        assert!(!should_clear_clipboard("outra coisa", "s3nh@"));
        assert!(!should_clear_clipboard("", "s3nh@"));
    }
}
