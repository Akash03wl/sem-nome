//! Comandos da aba Senhas (Fase 5). A chave de sessão e as senhas ficam só aqui,
//! na memória; o frontend recebe `VaultEntry` (sem segredos).

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use vitra_core::items::normalize_url;
use vitra_core::vault::{
    classify_login_error, parse_items, parse_status, should_clear_clipboard, should_lock, SessionGuard,
    VaultEntry, VaultSecret, VaultStatus,
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
    /// Cada trava invalida operações que começaram antes dela (sincronizar, entrar).
    pub guard: SessionGuard,
}

impl Default for VaultState {
    fn default() -> Self {
        VaultState {
            session: None,
            items: Vec::new(),
            last_used: Instant::now(),
            email: None,
            guard: SessionGuard::default(),
        }
    }
}

impl VaultState {
    fn clear(&mut self) {
        self.session = None;
        self.items.clear();
        self.guard.invalidate();
    }
}

/// Marca o início de uma operação lenta; o resultado só vale se o cofre não foi travado no meio.
fn begin(app: &AppHandle) -> u64 {
    app.state::<AppState>().vault.lock().unwrap().guard.begin()
}

/// Escreve na área de transferência. Segredos ficam fora do histórico (Win+V),
/// da área de transferência na nuvem e de programas que monitoram a área de transferência.
fn clipboard_write(text: &str, secret: bool) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|_| "Não consegui usar a área de transferência.".to_string())?;
    let result = if secret {
        #[cfg(windows)]
        {
            use arboard::SetExtWindows;
            cb.set().exclude_from_history().exclude_from_cloud().exclude_from_monitoring().text(text)
        }
        #[cfg(not(windows))]
        {
            cb.set_text(text)
        }
    } else {
        cb.set_text(text)
    };
    result.map_err(|_| "Não consegui copiar.".to_string())
}

/// Depois de 30 s, apaga a área de transferência se ela ainda tiver o segredo.
fn schedule_clear(value: Zeroizing<String>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(CLIPBOARD_SECONDS));
        // Outro programa pode estar usando a área de transferência: tenta algumas vezes.
        for _ in 0..5 {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                if let Ok(current) = cb.get_text() {
                    let current = Zeroizing::new(current);
                    if should_clear_clipboard(&current, &value) {
                        let _ = cb.clear();
                    }
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(300));
        }
    });
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

/// Guarda a sessão, sincroniza e carrega as contas — só se o cofre não foi travado
/// depois que a operação começou (`token`).
fn open_session(app: &AppHandle, session: Zeroizing<String>, token: u64) -> Result<VaultView, String> {
    let _ = bw::run(&["sync"], Some(&session), None);
    let json = Zeroizing::new(bw::run(&["list", "items"], Some(&session), None)?);
    let items = parse_items(&json)?;
    {
        let st = app.state::<AppState>();
        let mut v = st.vault.lock().unwrap();
        if !v.guard.still_valid(token) {
            drop(v);
            let _ = bw::run(&["lock"], None, None);
            return Ok(publish(app));
        }
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
    method: Option<u8>,
) -> Result<VaultView, String> {
    let password = Zeroizing::new(password);
    let token = begin(&app);
    blocking(move || {
        let email = email.trim().to_string();
        if email.is_empty() || password.is_empty() {
            return Err("Digite o e-mail e a senha mestra.".to_string());
        }
        let mut args = vec!["login", email.as_str(), "--passwordenv", bw::password_env(), "--raw"];
        let code = code.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
        // Uma tentativa só, com o método que o dono escolheu (0 = app, 1 = e-mail):
        // tentar outro método por conta própria gera avisos de "login falhou" no Bitwarden.
        let method = match method.unwrap_or(0) {
            0 => "0",
            1 => "1",
            _ => return Err("Método de verificação inválido.".to_string()),
        };
        if let Some(c) = &code {
            args.extend(["--method", method, "--code", c.as_str()]);
        }
        let session = bw::run(&args, None, Some(&password)).map_err(|e| classify_login_error(&e).to_string())?;
        app.state::<AppState>().vault.lock().unwrap().email = Some(email.clone());
        open_session(&app, Zeroizing::new(session), token)
    })
    .await?
}

/// Login com a chave de API (passa pela confirmação de novo dispositivo). O cofre fica
/// travado em seguida: o dono desbloqueia com a senha mestra.
#[tauri::command]
pub async fn vault_login_apikey(app: AppHandle, client_id: String, client_secret: String) -> Result<VaultView, String> {
    let secret = Zeroizing::new(client_secret);
    blocking(move || {
        let id = client_id.trim().to_string();
        if id.is_empty() || secret.trim().is_empty() {
            return Err("Cole o client_id e o client_secret.".to_string());
        }
        bw::run_env(
            &["login", "--apikey"],
            None,
            None,
            &[("BW_CLIENTID", id.as_str()), ("BW_CLIENTSECRET", secret.trim())],
        )
        .map_err(|e| classify_login_error(&e).to_string())?;
        Ok(publish(&app))
    })
    .await?
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, password: String) -> Result<VaultView, String> {
    let password = Zeroizing::new(password);
    let token = begin(&app);
    blocking(move || {
        if password.is_empty() {
            return Err("Digite a senha mestra.".to_string());
        }
        let session = bw::run(&["unlock", "--passwordenv", bw::password_env(), "--raw"], None, Some(&password))
            .map_err(|e| classify_login_error(&e).to_string())?;
        open_session(&app, Zeroizing::new(session), token)
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
        let (session, token) = {
            let st = app.state::<AppState>();
            let v = st.vault.lock().unwrap();
            (v.session.clone(), v.guard.begin())
        };
        match session {
            Some(s) => open_session(&app, s, token),
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
        let secret_field = field != "username";
        clipboard_write(&value, secret_field)?;
        if secret_field {
            schedule_clear(value);
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
