//! Chama a CLI oficial do Bitwarden (`bw`). A senha mestra vai por variável de ambiente
//! (`--passwordenv`) e a sessão por `BW_SESSION`: nada de segredo na linha de comando.

use std::path::PathBuf;
use std::process::Command;

const PASSWORD_ENV: &str = "VITRA_BW_PW";

/// Onde a CLI pode estar: no PATH, nos atalhos do winget ou na pasta do Vitra.
pub fn find() -> Option<PathBuf> {
    let exe = if cfg!(windows) { "bw.exe" } else { "bw" };
    let mut candidates: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).map(|d| d.join(exe)).collect())
        .unwrap_or_default();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        candidates.push(local.join("Microsoft").join("WinGet").join("Links").join(exe));
        candidates.push(local.join("Vitra").join("bw").join(exe));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Roda `bw` e devolve o stdout; em erro, o stderr (ou stdout) para interpretar.
pub fn run(args: &[&str], session: Option<&str>, password: Option<&str>) -> Result<String, String> {
    run_env(args, session, password, &[])
}

/// Como `run`, com variáveis extras (ex.: `BW_CLIENTID`/`BW_CLIENTSECRET` da chave de API).
pub fn run_env(
    args: &[&str],
    session: Option<&str>,
    password: Option<&str>,
    extra: &[(&str, &str)],
) -> Result<String, String> {
    let exe = find().ok_or_else(|| "A ferramenta do Bitwarden não está instalada.".to_string())?;
    let mut cmd = Command::new(exe);
    cmd.args(args).env("BW_NOINTERACTION", "true").env_remove("BW_SESSION");
    if let Some(s) = session {
        cmd.env("BW_SESSION", s);
    }
    if let Some(p) = password {
        cmd.env(PASSWORD_ENV, p);
    }
    for (k, v) in extra {
        cmd.env(k, v);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut out = cmd.output().map_err(|_| "Não consegui executar a ferramenta do Bitwarden.".to_string())?;
    let result = if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { String::from_utf8_lossy(&out.stdout).trim().to_string() } else { err })
    };
    // A saída pode ter a chave de sessão ou o cofre inteiro: apaga os buffers brutos.
    zeroize::Zeroize::zeroize(&mut out.stdout);
    zeroize::Zeroize::zeroize(&mut out.stderr);
    result
}

pub fn password_env() -> &'static str {
    PASSWORD_ENV
}

/// Instala a CLI pelo winget; sem winget, abre a página oficial.
#[cfg(windows)]
pub fn install() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let ok = Command::new("winget")
        .args([
            "install",
            "--id",
            "Bitwarden.CLI",
            "-e",
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .ok()
        .and_then(|s| s.code())
        .is_some_and(vitra_core::files::winget_succeeded);
    if ok && find().is_some() {
        return Ok(());
    }
    crate::win::open("https://bitwarden.com/help/cli/", "", false)?;
    Err("Abri a página da ferramenta do Bitwarden. Instale e clique em Verificar de novo.".into())
}

#[cfg(not(windows))]
pub fn install() -> Result<(), String> {
    Err("Disponível só no Windows.".into())
}
