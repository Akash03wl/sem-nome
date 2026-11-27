//! Comandos da aba Senhas (Fase 5). A chave de sessão e as senhas ficam só aqui,
//! na memória; o frontend recebe `VaultEntry` (sem segredos).

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use vitra_core::items::normalize_url;
use vitra_core::vault::{
    classify_login_error, parse_items, parse_status, should_clear_clipboard, should_lock, VaultEntry,
    VaultSecret, VaultStatus,
};
use zeroize::Zeroizing;

use crate::{bw, win, AppState};

/// Quanto tempo uma senha copiada fica na área de transferência.
const CLIPBOARD_SECONDS: u64 = 30;
/// De quanto em quanto tempo a trava automática confere o cofre.
const LOCK_CHECK_SECONDS: u64 = 15;

/// Estado do cofre na memória.
pub struct VaultState {
    pub session: Option<Zeroizing<String>>,
    pub items: Vec<VaultSecret>,
    pub last_used: Instant,
    pub email: Option<String>,
}

impl Default for VaultState {
    fn default() -> Self {
        VaultState { session: None, items: Vec::new(), last_used: Instant::now(), email: None }
    }
}

impl VaultState {
    fn clear(&mut self) {
        self.session = None;
        self.items.clear();
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultView {
    pub status: VaultStatus,
    pub email: Option<String>,
    pub entries: Vec<VaultEntry>,
}

fn unlocked_view(v: &VaultState) -> VaultView {
    VaultView {
        status: VaultStatus::Unlocked,
        email: v.email.clone(),
        entries: v.items.iter().map(VaultSecret::entry).collect(),
    }
}

/// Estado atual: sem a CLI, sem login, travado ou desbloqueado.
fn compute_view(app: &AppHandle) -> VaultView {
    {
        let st = app.state::<AppState>();
        let v = st.vault.lock().unwrap();
        if v.session.is_some() {
            return unlocked_view(&v);
        }
    }
    if bw::find().is_none() {
        return VaultView { status: VaultStatus::Missing, email: None, entries: vec![] };
    }
    let (status, email) = bw::run(&["status"], None, None)
        .ok()
        .and_then(|out| parse_status(&out))
        .unwrap_or((VaultStatus::Unauthenticated, None));
    // Sem a nossa chave de sessão, "unlocked" na CLI conta como travado para o Vitra.
    let status = if status == VaultStatus::Unlocked { VaultStatus::Locked } else { status };
    app.state::<AppState>().vault.lock().unwrap().email = email.clone();
    VaultView { status, email, entries: vec![] }
}

fn publish(app: &AppHandle) -> VaultView {
    let view = compute_view(app);
    let _ = app.emit("vault-changed", view.clone());
    view
}

/// Guarda a sessão, sincroniza e carrega as contas.
fn open_session(app: &AppHandle, session: Zeroizing<String>) -> Result<VaultView, String> {
    let _ = bw::run(&["sync"], Some(&session), None);
    let json = Zeroizing::new(bw::run(&["list", "items"], Some(&session), None)?);
    let items = parse_items(&json)?;
    {
        let st = app.state::<AppState>();
        let mut v = st.vault.lock().unwrap();
        v.session = Some(session);
        v.items = items;
        v.last_used = Instant::now();
    }
    Ok(publish(app))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "Algo deu errado com o cofre.".to_string())
}

#[tauri::command]
pub async fn vault_status(app: AppHandle) -> Result<VaultView, String> {
    blocking(move || compute_view(&app)).await
}

#[tauri::command]
pub async fn vault_login(
    app: AppHandle,
    email: String,
    password: String,
    code: Option<String>,
) -> Result<VaultView, String> {
    let password = Zeroizing::new(password);
    blocking(move || {
        let email = email.trim().to_string();
        if email.is_empty() || password.is_empty() {
            return Err("Digite o e-mail e a senha mestra.".to_string());
        }
        let pw_flag = bw::password_env();
        let code = code.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
        let args = vec!["login", email.as_str(), "--passwordenv", pw_flag, "--raw"];
        // Com código: tenta como app autenticador (método 0) e, se não servir, como e-mail (método 1).
        let attempts: Vec<Vec<&str>> = match &code {
            None => vec![args.clone()],
            Some(c) => vec![
                [args.as_slice(), &["--method", "0", "--code", c.as_str()]].concat(),
                [args.as_slice(), &["--method", "1", "--code", c.as_str()]].concat(),
            ],
        };
        let mut last_err = String::new();
        for a in attempts {
            match bw::run(&a, None, Some(&password)) {
                Ok(session) => {
                    app.state::<AppState>().vault.lock().unwrap().email = Some(email.clone());
                    return open_session(&app, Zeroizing::new(session));
                }
                Err(e) => last_err = e,
            }
        }
        Err(classify_login_error(&last_err).to_string())
    })
    .await?
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, password: String) -> Result<VaultView, String> {
    let password = Zeroizing::new(password);
    blocking(move || {
        if password.is_empty() {
            return Err("Digite a senha mestra.".to_string());
        }
        let session = bw::run(&["unlock", "--passwordenv", bw::password_env(), "--raw"], None, Some(&password))
            .map_err(|e| classify_login_error(&e).to_string())?;
        open_session(&app, Zeroizing::new(session))
    })
    .await?
}

#[tauri::command]
pub async fn vault_lock(app: AppHandle) -> Result<VaultView, String> {
    blocking(move || {
        app.state::<AppState>().vault.lock().unwrap().clear();
        let _ = bw::run(&["lock"], None, None);
        publish(&app)
    })
    .await
}

#[tauri::command]
pub async fn vault_logout(app: AppHandle) -> Result<VaultView, String> {
    blocking(move || {
        {
            let st = app.state::<AppState>();
            let mut v = st.vault.lock().unwrap();
            v.clear();
            v.email = None;
        }
        let _ = bw::run(&["logout"], None, None);
        publish(&app)
    })
    .await
}

#[tauri::command]
pub async fn vault_sync(app: AppHandle) -> Result<VaultView, String> {
    blocking(move || {
        let session = app.state::<AppState>().vault.lock().unwrap().session.clone();
        match session {
            Some(s) => open_session(&app, s),
            None => Ok(publish(&app)),
        }
    })
    .await?
}

/// Copia usuário, senha ou código 2FA. Senha e código somem da área de transferência em 30 s.
#[tauri::command]
pub async fn vault_copy(app: AppHandle, id: String, field: String) -> Result<(), String> {
    blocking(move || {
        let (secret, session) = {
            let st = app.state::<AppState>();
            let mut v = st.vault.lock().unwrap();
            if v.session.is_none() {
                return Err("O cofre está travado.".to_string());
            }
            v.last_used = Instant::now();
            let item = v.items.iter().find(|i| i.id == id).cloned().ok_or("Conta não encontrada.")?;
            (item, v.session.clone())
        };
        let value: Zeroizing<String> = match field.as_str() {
            "username" => Zeroizing::new(secret.username.clone().ok_or("Esta conta não tem usuário.")?),
            "password" => Zeroizing::new(secret.password.clone().ok_or("Esta conta não tem senha.")?),
            "totp" => Zeroizing::new(
                bw::run(&["get", "totp", &secret.id], session.as_deref().map(|s| s.as_str()), None)
                    .map_err(|_| "Não consegui gerar o código 2FA.".to_string())?,
            ),
            _ => return Err("Campo inválido.".to_string()),
        };
        app.clipboard()
            .write_text(value.as_str())
            .map_err(|_| "Não consegui copiar.".to_string())?;
        if field != "username" {
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(CLIPBOARD_SECONDS));
                let current = Zeroizing::new(app2.clipboard().read_text().unwrap_or_default());
                if should_clear_clipboard(&current, &value) {
                    let _ = app2.clipboard().clear();
                }
            });
        }
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn vault_open_site(app: AppHandle, id: String) -> Result<(), String> {
    blocking(move || {
        let uri = {
            let st = app.state::<AppState>();
            let mut v = st.vault.lock().unwrap();
            v.last_used = Instant::now();
            v.items.iter().find(|i| i.id == id).and_then(|i| i.uri.clone())
        };
        let url = normalize_url(&uri.ok_or("Esta conta não tem site.")?).map_err(|e| e.to_string())?;
        win::open(&url, "", false)
    })
    .await?
}

#[tauri::command]
pub async fn vault_install_cli(app: AppHandle) -> Result<VaultView, String> {
    blocking(move || {
        bw::install()?;
        Ok(publish(&app))
    })
    .await?
}

/// Trava sozinho depois de `vault_lock_minutes` sem uso.
pub fn spawn_auto_lock(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(LOCK_CHECK_SECONDS));
        let state = app.state::<AppState>();
        let minutes = state.settings.lock().unwrap().vault_lock_minutes;
        let expired = {
            let mut v = state.vault.lock().unwrap();
            let expired = v.session.is_some() && should_lock(v.last_used.elapsed().as_secs(), minutes);
            if expired {
                v.clear();
            }
            expired
        };
        if expired {
            let _ = bw::run(&["lock"], None, None);
            publish(&app);
        }
    });
}
