# Vitra — Fase 4 (Arquivos com Everything) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A busca do pop-up passa a achar **qualquer arquivo ou pasta do PC** através do Everything (voidtools). Quando o Everything não está instalado ou não está aberto, o Vitra explica e oferece um botão para resolver.

**Architecture:** O Vitra carrega a DLL oficial do SDK do Everything (`Everything64.dll`) em tempo de execução, com `libloading`. A DLL é baixada pelo CI e vai junto no instalador como recurso. As chamadas à DLL ficam atrás de um `Mutex`, porque o SDK não é thread-safe, e rodam em `spawn_blocking`. O frontend pede os arquivos de forma assíncrona: espera 150 ms depois da última tecla (*debounce*) e descarta respostas atrasadas. Os resultados entram por último na lista de resultados, como no spec 5.3.

**Tech Stack:** Fases 1–3 + `libloading` 0.9 (só no Windows) + Everything SDK (DLL baixada no CI de `https://www.voidtools.com/Everything-SDK.zip`).

**Spec:** `docs/superpowers/specs/2026-11-26-vitra-design.md` (seção 5.7; fase 4 da seção 6)

## Global Constraints

- Arquivos aparecem **depois** dos comandos e trazem no máximo 20 resultados.
- Só busca com 2 ou mais caracteres e quando o texto não é uma conta nem uma palavra-chave de internet.
- Everything não instalado → a seção "Arquivos" mostra "Instale o Everything para buscar arquivos do PC" e o botão **Instalar Everything**: tenta `winget install --id voidtools.Everything -e --silent --accept-package-agreements --accept-source-agreements` e, se o winget não existir, abre `https://www.voidtools.com/downloads/`.
- Everything instalado mas fechado → "O Everything está fechado" e o botão **Abrir Everything** (`Everything.exe -startup`).
- A busca indexada do próprio Windows (alternativa) **não** entra nesta fase: o spec deixa como opcional e a decisão é do construtor.
- O pop-up nunca espera pelo Everything: os itens aparecem na hora e os arquivos chegam depois.

## Review Focus

1. **Everything fechado ou desinstalado depois de o Vitra abrir**: a busca de arquivos volta o status certo e nada trava → `everything_status_from_codes` (Task 1) e `QuickLauncher › mostra aviso quando o Everything está fechado` (Task 3).
2. **Digitar rápido**: uma resposta atrasada não sobrescreve a mais nova → `useFileSearch › ignora resposta atrasada` (Task 3).
3. **Arquivo que sumiu entre a busca e o Enter**: aparece "Não encontrei este item…" → reaproveita `ensure_exists` (Task 2).
4. **Caminhos com acento, espaço ou muito longos** (> 260 caracteres): voltam inteiros → buffer de 32 768 caracteres em `GetResultFullPathNameW` (Task 2).
5. **DLL ausente** (rodando com `tauri dev` sem baixar o SDK): o status vira "DLL do Everything não encontrada" e o app não trava → `everything_status_from_codes` (Task 1).

---

### Task 1: Núcleo (`vitra-core::files`)

**Produces:**
- `#[serde(rename_all = "camelCase")] struct FileHit { name: String, path: String, is_dir: bool }`
- `#[serde(rename_all = "camelCase")] enum EverythingStatus { Ready, NotRunning, NotInstalled, DllMissing }`
- `fn status_from(dll_loaded: bool, last_error: Option<u32>, installed: bool) -> EverythingStatus`: sem DLL → `DllMissing`; erro 2 (IPC) → `NotRunning` se instalado, senão `NotInstalled`; o resto → `Ready`
- `fn status_message(s: EverythingStatus) -> Option<&'static str>`: `Ready` → `None`; `NotRunning` → "O Everything está fechado."; `NotInstalled` → "Instale o Everything para buscar arquivos do PC."; `DllMissing` → "DLL do Everything não encontrada."
- `fn file_hit(path: &str, is_dir: bool) -> FileHit`: o nome é o último pedaço do caminho

**Tests:** `everything_status_from_codes`, `status_messages`, `file_hit_name_from_path` (`C:\Users\Ana\Música\aula 1.mp3` → "aula 1.mp3"; `D:\` → "Disco D:"), `file_hit_serializes_camel_case`.

### Task 2: Windows: DLL do Everything e comandos

**Files:** `src-tauri/src/win/everything.rs` (+ fallback), `src-tauri/src/files_cmds.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (`libloading` em `cfg(windows)`), `src-tauri/tauri.conf.json` (`bundle.resources`: `{"resources/Everything64.dll": "Everything64.dll"}`), `.gitignore` (`src-tauri/resources/`)

**Produces:**
- `win::everything::Everything::load(dll_path: &Path) -> Option<Everything>`: guarda `Library` e os símbolos `Everything_SetSearchW`, `Everything_SetMax`, `Everything_SetRequestFlags`, `Everything_QueryW`, `Everything_GetNumResults`, `Everything_GetResultFullPathNameW`, `Everything_IsFolderResult`, `Everything_GetLastError`, `Everything_GetMajorVersion`
- `fn search(&self, query: &str, max: u32) -> Result<Vec<FileHit>, u32>` (código de erro do SDK); `fn probe(&self) -> Option<u32>` (`GetMajorVersion` → 0 significa erro, então lê `GetLastError`)
- `fn installed() -> bool`: `Everything.exe` em `%ProgramFiles%\Everything` ou `%ProgramFiles(x86)%\Everything`; `fn start() -> Result<(), String>`; `fn install() -> Result<(), String>` (winget e, se falhar, a página de downloads)
- Estado: `everything: Mutex<Option<Everything>>`, carregado no setup de `resource_dir()/Everything64.dll`
- Comandos: `search_files(query: String) -> Result<Vec<FileHit>, EverythingStatus>` (async + `spawn_blocking`, 20 resultados), `everything_status() -> EverythingStatus`, `everything_start()`, `everything_install()`, `open_path(path, admin)`, `reveal_path(path)` (os dois com `ensure_exists`)

Verificação: `cargo clippy -p vitra --target x86_64-pc-windows-msvc` limpo.

### Task 3: Frontend: arquivos na busca

**Files:** `src/search/useFileSearch.ts` (+ teste), `src/search/search.ts` (tipo `file`), `src/quick/QuickLauncher.tsx` (+ testes), `src/lib/api.ts`, `src/lib/types.ts`, `src/main.tsx`

**Produces:**
- `type FileHit`, `type EverythingStatus` no TS
- `SearchResult` + `{ type: "file"; id: string; hit: FileHit }` e `{ type: "fileStatus"; id: "files-status"; status: EverythingStatus; message: string }`
- `useFileSearch(query: string, enabled: boolean, fetcher: (q: string) => Promise<FileHit[] | EverythingStatus>, delay = 150): { hits: FileHit[]; status: EverythingStatus | null }`
- `fileSearchEnabled(query: string, shortcuts: WebShortcut[]): boolean`: 2+ caracteres, não é conta e não é palavra-chave
- Props do QuickLauncher: `onSearchFiles`, `onOpenPath(path, admin)`, `onRevealPath(path)`, `onEverythingFix(status)`
- Enter num arquivo abre; Ctrl+Enter abre como administrador; Shift+Enter abre o local. Enter no aviso de status chama `onEverythingFix`

**Tests:** `useFileSearch › espera o debounce`, `useFileSearch › ignora resposta atrasada`, `useFileSearch › desligado não busca`, `fileSearchEnabled › regras`, `QuickLauncher › mostra arquivos depois dos comandos`, `QuickLauncher › Enter abre arquivo e Shift+Enter abre o local`, `QuickLauncher › mostra aviso quando o Everything está fechado`.

### Task 4: Painel: status do Everything

**Files:** `src/panel/Panel.tsx` (+ testes): linha "Busca de arquivos (Everything)" com o status e o botão certo (Instalar / Abrir / nenhum)

**Tests:** `Panel › mostra Everything funcionando`, `Panel › oferece instalar quando falta`, `Panel › oferece abrir quando está fechado`.

### Task 5: CI, build e checklist

- `.github/workflows/build.yml`: passo "Baixar SDK do Everything" (PowerShell: `Invoke-WebRequest https://www.voidtools.com/Everything-SDK.zip`, `Expand-Archive` e cópia de `dll\Everything64.dll` para `src-tauri\resources\`) antes do build
- README: checklist da Fase 4 + aviso para quem usa `tauri dev` (baixar a DLL)
- Push, CI verde e artefato
