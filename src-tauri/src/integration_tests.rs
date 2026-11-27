//! Testes de integração com o Windows de verdade (rodam no CI, em `windows-latest`).
//! Marcados `#[ignore]`: rode com `cargo test -p vitra --lib -- --ignored --test-threads=1`.
//! Os do Everything e do Bitwarden precisam deles instalados (o CI instala).

use std::time::{Duration, Instant};

use vitra_core::items::launch_error_message;
use vitra_core::vault::{classify_login_error, parse_status, LoginError, VaultStatus};

use crate::{bw, win};

const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

#[test]
#[ignore]
fn discover_lists_installed_apps_without_junk() {
    let apps = win::discover();
    println!("{} apps encontrados; primeiros: {:?}", apps.len(), apps.iter().take(8).map(|a| &a.name).collect::<Vec<_>>());
    assert!(!apps.is_empty(), "nenhum app encontrado em shell:AppsFolder");
    assert!(apps.iter().all(|a| a.target.starts_with("shell:AppsFolder\\")));
    assert!(apps.iter().all(|a| !vitra_core::items::is_junk(&a.name)));
}

#[test]
#[ignore]
fn icons_are_real_pngs() {
    let apps = win::discover();
    let found = apps.iter().take(20).filter_map(|a| win::icon_png(&a.target, 64)).collect::<Vec<_>>();
    println!("{} de {} ícones extraídos", found.len(), apps.len().min(20));
    assert!(!found.is_empty(), "nenhum ícone extraído");
    assert!(found.iter().all(|png| png.starts_with(&PNG_MAGIC)));
    // Também de um caminho comum do sistema.
    let notepad = win::icon_png("C:\\Windows\\System32\\notepad.exe", 64).expect("ícone do notepad");
    assert!(notepad.starts_with(&PNG_MAGIC));
}

#[test]
#[ignore]
fn opening_missing_file_gives_friendly_message_without_dialog() {
    let err = win::open("C:\\nao\\existe\\vitra-teste.exe", "", false).unwrap_err();
    assert_eq!(Some(err), launch_error_message(2));
}

#[test]
#[ignore]
fn empty_recycle_bin_succeeds() {
    win::run_system(vitra_core::system::SystemCommand::EmptyRecycleBin).expect("esvaziar lixeira");
}

#[test]
#[ignore]
fn everything_finds_a_real_file() {
    let dll = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("Everything64.dll");
    let ev = win::everything::Everything::load(&dll).expect("carregar Everything64.dll");
    assert!(win::everything::installed(), "Everything.exe não encontrado");
    // O Everything leva alguns segundos para abrir e indexar.
    let deadline = Instant::now() + Duration::from_secs(120);
    let hits = loop {
        if ev.probe().is_none() {
            if let Ok(hits) = ev.search("notepad.exe", 20) {
                if !hits.is_empty() {
                    break hits;
                }
            }
        }
        assert!(Instant::now() < deadline, "o Everything não respondeu em 2 min (probe = {:?})", ev.probe());
        std::thread::sleep(Duration::from_secs(2));
    };
    println!("{:?}", hits.iter().take(5).map(|h| &h.path).collect::<Vec<_>>());
    assert!(hits.iter().any(|h| h.path.to_lowercase().ends_with("notepad.exe") && !h.is_dir));
    assert!(hits.iter().all(|h| !h.path.contains("\\WinSxS\\")), "cópias internas do Windows deveriam ficar de fora");
}

#[test]
#[ignore]
fn autostart_registers_only_for_current_user() {
    crate::autostart::set(true).expect("ligar");
    assert!(crate::autostart::is_enabled());
    let hkcu = std::process::Command::new("reg")
        .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Vitra"])
        .output()
        .unwrap();
    assert!(hkcu.status.success(), "não está em HKCU");
    let hklm = std::process::Command::new("reg")
        .args(["query", "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Vitra"])
        .output()
        .unwrap();
    assert!(!hklm.status.success(), "não deveria estar em HKLM");
    crate::autostart::set(false).expect("desligar");
    assert!(!crate::autostart::is_enabled());
}

#[test]
#[ignore]
fn bitwarden_cli_status_is_understood() {
    assert!(bw::find().is_some(), "bw não encontrado");
    let out = bw::run(&["status"], None, None).expect("bw status");
    println!("bw status: {out}");
    let (status, _) = parse_status(&out).expect("status do bw não reconhecido");
    assert_eq!(status, VaultStatus::Unauthenticated);
}

#[test]
#[ignore]
fn bitwarden_wrong_password_message_is_recognised() {
    let err = bw::run(
        &["login", "vitra-teste-inexistente@example.com", "--passwordenv", bw::password_env(), "--raw"],
        None,
        Some("senha-errada-de-teste"),
    )
    .unwrap_err();
    let kind = classify_login_error(&err);
    println!("bw login (senha errada): {err:?} → {kind:?}");
    // O Bitwarden pode exigir captcha/novo dispositivo para contas desconhecidas; o que
    // importa é não cair na mensagem genérica.
    assert!(
        matches!(kind, LoginError::WrongPassword | LoginError::NewDevice | LoginError::TwoFactorRequired),
        "texto da CLI não reconhecido: {err}"
    );
}
