# Vitra — Fase 5 (Senhas com Bitwarden) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma aba **Senhas** no painel, com o visual do Vitra, que usa o cofre do Bitwarden do dono. Ela permite criar a conta, entrar, desbloquear, buscar e copiar usuário, senha ou código 2FA, e abrir o site. Quando o cofre está desbloqueado, as contas também aparecem na busca do pop-up. O cofre trava sozinho e a senha copiada some da área de transferência.

**Architecture:** O Vitra chama a CLI oficial `bw`. A senha mestra vai para a CLI por variável de ambiente (`--passwordenv`) e nunca por argumento nem por arquivo. A chave de sessão e os itens do cofre (com as senhas) ficam **só na memória do Rust**. O frontend recebe um resumo sem segredos (nome, usuário, site, se tem senha/2FA). Copiar é feito pelo Rust (`tauri-plugin-clipboard-manager`), que agenda a limpeza da área de transferência. Uma thread trava o cofre depois de N minutos sem uso. A parte testável (interpretar o JSON e os erros da CLI, decidir quando travar, decidir quando limpar) fica em `vitra-core::vault`.

**Tech Stack:** Fases 1–4 + `tauri-plugin-clipboard-manager` 2.5 + `zeroize` 1.9 + Bitwarden CLI (`bw`, instalada pelo winget `Bitwarden.CLI` quando falta).

**Spec:** `docs/superpowers/specs/2026-11-26-vitra-design.md` (seção 5.8; fase 5 da seção 6; busca 5.3 #6)

## Global Constraints

- **O Vitra nunca grava a senha mestra, a chave de sessão nem as senhas em disco** e não manda as senhas para o frontend.
- Trava sozinho depois de **5 minutos** sem uso; configurável em 1, 5, 15 ou 30 min (`Settings.vault_lock_minutes`).
- A senha copiada é apagada da área de transferência depois de **30 segundos**, a menos que o dono já tenha copiado outra coisa.
- Botões por conta: **Copiar usuário**, **Copiar senha**, **Copiar código 2FA** (se houver) e **Abrir site** (só `http`/`https`).
- Criar e editar contas: o botão **Abrir no Bitwarden** abre `https://vault.bitwarden.com`. Criar conta: o botão **Criar conta grátis** abre `https://vault.bitwarden.com/#/register`.
- Na busca do pop-up, as senhas só aparecem com o cofre desbloqueado: Enter copia a senha e Shift+Enter copia o usuário.
- Servidor: só `bitwarden.com` nesta fase (conta nova é criada lá).

## Review Focus

1. **Senha mestra errada / 2FA pedido / código 2FA errado**: cada caso tem mensagem própria e o formulário pede o código quando precisa → `classify_login_error_*` (Task 1) e `VaultSection › pede código 2FA` (Task 3).
2. **CLI do Bitwarden ausente**: a aba explica e oferece instalar; nada trava → `VaultSection › oferece instalar a ferramenta` (Task 3).
3. **Área de transferência trocada pelo dono antes dos 30 s**: o Vitra não apaga o que o dono copiou depois → `should_clear_clipboard_*` (Task 1).
4. **Cofre travou (tempo esgotado) com o painel aberto**: a lista some e o formulário de desbloqueio volta, sem senhas na tela → `VaultSection › volta a pedir senha quando trava` (Task 3).
5. **Item sem usuário, sem senha ou sem site** (notas, cartões): não quebra; os botões que não se aplicam não aparecem → `parse_items_skips_non_logins_and_missing_fields` (Task 1).

---

### Task 1: Núcleo (`vitra-core::vault`)

**Produces:**
- `enum VaultStatus { Missing, Unauthenticated, Locked, Unlocked }` (serde camelCase); `parse_status(json: &str) -> Option<(VaultStatus, Option<String>)>` (status + e-mail, a partir do `bw status`)
- `struct VaultSecret { id, name, username: Option<String>, password: Option<String>, totp: bool, uri: Option<String> }` (`Zeroize` no drop)
- `#[serde(rename_all = "camelCase")] struct VaultEntry { id, name, username: Option<String>, has_password: bool, has_totp: bool, uri: Option<String> }` e `VaultSecret::entry(&self) -> VaultEntry`
- `parse_items(json: &str) -> Result<Vec<VaultSecret>, String>`: só `type == 1` (login); a 1ª URI `http(s)` vira `uri`; ordena por nome
- `enum LoginError { WrongPassword, TwoFactorRequired, InvalidCode, NoInternet, Other(String) }` com `Display` pt-BR ("Senha mestra incorreta.", "Digite o código de verificação (2FA).", "Código de verificação inválido.", "Sem conexão com o Bitwarden. Verifique a internet.", e a 1ª linha da CLI); `classify_login_error(stderr: &str) -> LoginError` (sem diferenciar maiúsculas: "invalid master password"/"username or password is incorrect" → Wrong; "two-step"/"two factor" + "required"/"code" → TwoFactorRequired; "invalid" + "code"/"token" → InvalidCode; "econnrefused"/"enotfound"/"fetch failed"/"network" → NoInternet)
- `should_lock(last_used_secs_ago: u64, minutes: u32) -> bool`
- `should_clear_clipboard(current: &str, written: &str) -> bool` (só se ainda for o que o Vitra escreveu)
- `Settings.vault_lock_minutes: u32` (padrão 5; valores fora de {1,5,15,30} viram 5 ao carregar)

**Tests:** `parse_status_reads_states_and_email`, `parse_status_rejects_garbage`, `parse_items_maps_login_fields`, `parse_items_skips_non_logins_and_missing_fields`, `entry_has_no_secrets` (o JSON do `VaultEntry` não contém a senha), `classify_login_error_wrong_password`, `classify_login_error_two_factor`, `classify_login_error_invalid_code`, `classify_login_error_network`, `classify_login_error_other_first_line`, `should_lock_after_timeout`, `should_clear_clipboard_only_if_unchanged`, `vault_lock_minutes_default_and_sanitized`.

### Task 2: Windows: CLI, estado e comandos

**Files:** `src-tauri/src/win/bw.rs` (+ fallback), `src-tauri/src/vault_cmds.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json` (+ `clipboard-manager:default` não é necessário: o Rust escreve direto), `package.json` não muda

**Produces:**
- `bw::find() -> Option<PathBuf>` (PATH, `%LOCALAPPDATA%\Microsoft\WinGet\Links\bw.exe`, `%LOCALAPPDATA%\Vitra\bw\bw.exe`); `bw::run(exe, args, session: Option<&str>, password: Option<&str>) -> Result<String, String>` (stdout em caso de sucesso; stderr como erro; sem janela; `BW_NOINTERACTION=true`; senha em `VITRA_BW_PW`; sessão em `BW_SESSION`)
- `bw::install()` (winget `Bitwarden.CLI`, com `winget_succeeded`; se falhar, abre a página da CLI)
- Estado `vault: Mutex<VaultState { session: Option<Zeroizing<String>>, items: Vec<VaultSecret>, last_used: Instant, email: Option<String> }>`
- Comandos: `vault_status() -> VaultView` (`{ status, email, entries }`), `vault_login(email, password, code: Option<String>) -> Result<VaultView, String>`, `vault_unlock(password) -> Result<VaultView, String>` (unlock + `sync` + `list items`), `vault_lock()`, `vault_logout()`, `vault_sync()`, `vault_copy(id, field: "username"|"password"|"totp") -> Result<(), String>` (TOTP com `bw get totp`; agenda a limpeza só para senha e TOTP), `vault_open_site(id)`, `vault_install_cli()`
- Evento `vault-changed` (`VaultView`) a cada mudança; thread de auto-lock checa a cada 15 s

Verificação: `cargo clippy -p vitra --target x86_64-pc-windows-msvc` limpo.

### Task 3: Painel: aba Senhas (`src/panel/VaultSection.tsx`)

Estados:
- **CLI ausente:** explica e mostra **Instalar ferramenta do Bitwarden**.
- **Sem login:** **Criar conta grátis** + formulário (e-mail, senha mestra e código 2FA quando pedido).
- **Travado:** campo de senha mestra + **Desbloquear** e o link **Sair da conta**.
- **Desbloqueado:** busca e lista; botões por conta; **Bloquear agora**, **Sincronizar**, **Abrir no Bitwarden**; aviso "Senhas copiadas somem da área de transferência em 30 s".

Configurações ganha "Travar o cofre depois de" (1/5/15/30 min).

**Tests:** `oferece instalar a ferramenta`, `sem login mostra criar conta e login`, `pede código 2FA` (login devolve "Digite o código de verificação (2FA)." → aparece o campo; o envio seguinte inclui o código), `desbloqueia e lista contas`, `copiar senha chama onCopy com password`, `esconde botões que não se aplicam`, `volta a pedir senha quando trava` (a prop `view` muda para `locked`), `busca filtra por nome e usuário`, `Panel › muda tempo de bloqueio`.

### Task 4: Pop-up: senhas na busca

**Produces:** `SearchResult` + `{ type: "password"; id: string; entry: VaultEntry }` (grupo "Senhas", depois de Arquivos); `search` recebe `vault: VaultEntry[]` (vazio se travado). Enter → `onVaultCopy(id, "password")` e mostra "Senha copiada!"; Shift+Enter → `"username"`.

**Tests:** `search › senhas só quando há entradas`, `QuickLauncher › Enter copia a senha e Shift+Enter o usuário`.

### Task 5: CI, README e checklist

Sem mudança no CI (a CLI é instalada no PC do dono). README: checklist da Fase 5 e explicação de segurança.
