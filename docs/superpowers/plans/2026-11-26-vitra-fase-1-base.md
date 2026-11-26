# Vitra — Fase 1 (Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um app Tauri instalável no Windows que abre com o sistema, fica na bandeja, mostra o pop-up de vidro com `Alt+Espaço` e tem um painel com Configurações (atalho, abrir com o Windows, cor de destaque), com o instalador gerado pelo GitHub Actions.

**Architecture:** Workspace Cargo com duas crates: `crates/vitra-core` (Rust puro, sem Tauri, testável em qualquer SO: configurações, validação de atalho, geometria) e `src-tauri` (casca do app: janelas, bandeja, atalho global, autostart, efeito de vidro). Frontend React + TypeScript + Vite numa SPA só; cada janela (`quick` e `panel`) renderiza sua tela pelo rótulo da janela. Componentes recebem callbacks por props, e só `src/lib/api.ts` fala com o Tauri, para que tudo seja testável no Vitest sem Tauri.

**Tech Stack:** Tauri 2.12, `tauri-plugin-global-shortcut` 2.4, `tauri-plugin-autostart` 2.7, `tauri-plugin-single-instance` 2.5, `window-vibrancy` 0.8, serde/serde_json; React 19, Vite 8, TypeScript, Vitest 5 + Testing Library; GitHub Actions `windows-latest` + `tauri-apps/tauri-action@v0`.

**Spec:** `docs/superpowers/specs/2026-11-26-vitra-design.md`

## Global Constraints

- Windows 10 e 11; vidro Mica no Win11, Acrílico como alternativa no Win10.
- Toda a interface em português (Brasil).
- Nome do app: **Vitra**; identificador `com.vitra.app`.
- Atalho padrão `Alt+Space`; configurável; se o registro falhar, avisar e pedir outro (o app não pode fechar nem travar).
- Pop-up: some ao perder o foco ou com Esc.
- Cor de destaque padrão `#9b82ff`; opções `#9b82ff`, `#3fd0c9`, `#ff8a4c`, `#4c9dff`.
- Fontes: Inter (texto) e Space Grotesk (nome/títulos), empacotadas localmente (o app não depende de internet).
- Configuração em JSON em `%APPDATA%\Vitra\settings.json` (via `app_config_dir()` do Tauri), com backup `settings.json.bak` da versão anterior a cada gravação.
- Abre com o Windows já escondido na bandeja; instância única.
- Metas: pop-up visível em < ~150 ms; < ~80 MB de RAM em repouso.
- Este container é Linux sem webkit2gtk: aqui só rodam `cargo test -p vitra-core` e `npm test`. A casca `src-tauri` só compila no CI do Windows.

## Review Focus

1. **Atalho já em uso** (`Alt+Space` é usado pelo PowerToys Run e pelo menu de janela do Windows): o app deve iniciar mesmo assim, abrir o painel em Configurações e mostrar "Não consegui usar o atalho Alt+Space. Escolha outro." → teste `Panel › mostra aviso de atalho indisponível` (Task 4).
2. **`settings.json` ausente, corrompido ou de versão antiga sem campos novos**: o app abre com os padrões ou com o backup, nunca trava → testes `load_*` (Task 1).
3. **Vários monitores com escalas diferentes**: o pop-up aparece centralizado no monitor onde está o mouse, não fora da tela → testes `center_in_monitor_*` (Task 2).
4. **Reabrir o pop-up**: a busca volta vazia e com o foco nela, sem o texto da vez anterior → teste `QuickLauncher › limpa e foca a busca ao reabrir` (Task 3).
5. **Atalho digitado inválido nas Configurações** (`a`, `Ctrl+`, vazio): a mensagem de erro aparece e o atalho anterior continua funcionando → testes `normalize_*` (Task 2) e `Panel › mostra erro de atalho inválido` (Task 4).

---

## File Structure

```
Cargo.toml                         workspace: crates/vitra-core, src-tauri
crates/vitra-core/
  Cargo.toml
  src/lib.rs                       pub mod settings; pub mod hotkey; pub mod geometry;
  src/settings.rs                  Settings + load/save com backup
  src/hotkey.rs                    normalize() de atalhos
  src/geometry.rs                  center_in_monitor()
package.json, vite.config.ts, tsconfig.json, index.html
src/
  main.tsx                         escolhe QuickLauncher ou Panel pelo rótulo da janela
  theme/tokens.css                 cores, raios, fontes (@font-face locais)
  assets/fonts/                    Inter e Space Grotesk (woff2)
  lib/api.ts                       ÚNICO arquivo que importa @tauri-apps/*
  lib/types.ts                     tipo Settings espelhando o Rust
  quick/QuickLauncher.tsx (+ .css)
  quick/QuickLauncher.test.tsx
  panel/Panel.tsx (+ .css)
  panel/Panel.test.tsx
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json
  icons/                           gerados por `npx tauri icon app-icon.svg`
  src/main.rs                      chama vitra_lib::run()
  src/lib.rs                       Builder: plugins, setup, comandos
  src/windows.rs                   show/hide/toggle do quick, open_panel, vidro
  src/tray.rs                      ícone e menu da bandeja
  src/shortcut.rs                  registrar/trocar atalho global
  src/commands.rs                  get_settings, save_settings, hide_quick, open_panel
app-icon.svg
.github/workflows/build.yml
```

---

### Task 1: Workspace + configurações (`vitra-core::settings`)

**Files:**
- Create: `Cargo.toml`, `crates/vitra-core/Cargo.toml`, `crates/vitra-core/src/lib.rs`, `crates/vitra-core/src/settings.rs`, `.gitignore` (`target/`, `node_modules/`, `dist/`)
- Test: `crates/vitra-core/src/settings.rs` (módulo `#[cfg(test)]`, usa `tempfile`)

**Interfaces:**
- Produces:
  - `#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)] #[serde(default, rename_all = "camelCase")] pub struct Settings { pub version: u32, pub hotkey: String, pub accent: String, pub autostart: bool }`
  - `impl Default for Settings` → `version: 1, hotkey: "Alt+Space", accent: "#9b82ff", autostart: true`
  - `pub fn load(path: &Path) -> Settings`
  - `pub fn save(path: &Path, s: &Settings) -> std::io::Result<()>`
  - `pub const ACCENTS: [&str; 4] = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"];`

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn load_missing_file_returns_defaults()        // load(dir/"settings.json") == Settings::default()
#[test] fn save_then_load_roundtrips()                  // hotkey "Ctrl+Space", accent "#3fd0c9", autostart false
#[test] fn save_creates_parent_dir()                    // path dir/"Vitra"/"settings.json" ainda não existe
#[test] fn save_keeps_previous_version_as_bak()         // salva A, salva B → settings.json.bak contém A
#[test] fn load_partial_file_fills_missing_fields()     // arquivo `{"hotkey":"Ctrl+K"}` → hotkey "Ctrl+K", accent "#9b82ff", autostart true
#[test] fn load_corrupt_file_falls_back_to_bak()        // settings.json = "{oops", .bak válido com hotkey "Ctrl+K" → hotkey "Ctrl+K"
#[test] fn load_corrupt_file_and_no_bak_returns_defaults()
#[test] fn load_invalid_accent_resets_to_default()      // accent "#123456" (fora de ACCENTS) → "#9b82ff"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vitra-core settings`
Expected: FAIL (erro de compilação: `load`/`save` não existem)

- [ ] **Step 3: Implement `load` and `save` in `crates/vitra-core/src/settings.rs`**

`save`: `create_dir_all` do pai; se o arquivo existe, `copy` para `settings.json.bak`; grava em `settings.json.tmp` e depois `rename` (gravação atômica). `load`: tenta o principal, depois o `.bak`, e por fim `Default`; depois de desserializar, troca um `accent` fora de `ACCENTS` pelo padrão. Dependências: `serde` (derive) e `serde_json`; `tempfile` em dev.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vitra-core settings`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml .gitignore crates/
git commit -m "feat(core): configurações com backup e recuperação"
```

---

### Task 2: Atalho e geometria (`vitra-core::hotkey`, `vitra-core::geometry`)

**Files:**
- Create: `crates/vitra-core/src/hotkey.rs`, `crates/vitra-core/src/geometry.rs`
- Modify: `crates/vitra-core/src/lib.rs` (exportar os módulos)

**Interfaces:**
- Produces:
  - `pub fn normalize(input: &str) -> Result<String, HotkeyError>`: devolve no formato de acelerador do Tauri, com modificadores na ordem `Ctrl+Alt+Shift+Super+Tecla`
  - `#[derive(Debug, PartialEq)] pub enum HotkeyError { Empty, NoModifier, NoKey, UnknownKey(String) }` com `impl Display` em português: `"Digite um atalho."`, `"Use pelo menos Ctrl, Alt, Shift ou Win."`, `"Falta a tecla principal."`, `"Tecla desconhecida: {0}"`
  - `#[derive(Clone, Copy, Debug, PartialEq)] pub struct Rect { pub x: i32, pub y: i32, pub w: u32, pub h: u32 }` (pixels físicos)
  - `pub fn center_in_monitor(monitor: Rect, logical_w: u32, logical_h: u32, scale: f64) -> (i32, i32)`: posição física do canto superior esquerdo

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn normalize_accepts_default()            // "Alt+Space" → Ok("Alt+Space")
#[test] fn normalize_is_case_and_space_insensitive() // " alt + space " → Ok("Alt+Space")
#[test] fn normalize_orders_modifiers()           // "shift+ctrl+k" → Ok("Ctrl+Shift+K")
#[test] fn normalize_maps_win_to_super()          // "Win+J" → Ok("Super+J")
#[test] fn normalize_accepts_function_and_digit() // "Ctrl+F5" → Ok("Ctrl+F5"); "Alt+1" → Ok("Alt+1")
#[test] fn normalize_rejects_empty()              // "" → Err(Empty)
#[test] fn normalize_rejects_no_modifier()        // "a" → Err(NoModifier)
#[test] fn normalize_rejects_only_modifiers()     // "Ctrl+" e "Ctrl+Shift" → Err(NoKey)
#[test] fn normalize_rejects_unknown_key()        // "Ctrl+Banana" → Err(UnknownKey("Banana"))
#[test] fn center_in_monitor_primary_100pct()     // monitor {0,0,1920,1080}, 720x452, 1.0 → (600, 314)
#[test] fn center_in_monitor_scaled_second_screen() // monitor {1920,0,2560,1440}, 720x452, 1.5 → (1920+740, 381)
#[test] fn center_in_monitor_never_offscreen()    // monitor {0,0,800,600}, 720x452, 1.5 → x == 0 e y == 0 (limita ao monitor)
```

Teclas aceitas: `A`–`Z`, `0`–`9`, `F1`–`F24`, `Space`, `Enter`, `Tab`, `Esc`, `Backquote`. Modificadores: `ctrl|control`, `alt`, `shift`, `win|super|meta`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vitra-core`
Expected: FAIL (`normalize`/`center_in_monitor` não existem)

- [ ] **Step 3: Implement `normalize` and `center_in_monitor`**

`center_in_monitor`: tamanho físico = lógico × escala (arredondado); `x = monitor.x + (monitor.w − fw)/2`, limitado a `[monitor.x, monitor.x + monitor.w − fw]` e nunca menor que `monitor.x` (o mesmo para y).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vitra-core`
Expected: PASS (20 testes no total)

- [ ] **Step 5: Commit**

```bash
git add crates/vitra-core
git commit -m "feat(core): validação de atalho e centralização no monitor"
```

---

### Task 3: Frontend base + pop-up (`QuickLauncher`)

**Files:**
- Create: `package.json` (scripts `dev`, `build`, `test` = `vitest run`, `tauri`), `vite.config.ts` (porta fixa 1420, `test.environment: "jsdom"`), `tsconfig.json`, `index.html` (`lang="pt-BR"`, título "Vitra"), `src/theme/tokens.css`, `src/assets/fonts/*.woff2`, `src/lib/types.ts`, `src/quick/QuickLauncher.tsx`, `src/quick/QuickLauncher.css`
- Test: `src/quick/QuickLauncher.test.tsx`

**Interfaces:**
- Produces:
  - `src/lib/types.ts`: `export interface Settings { version: number; hotkey: string; accent: string; autostart: boolean }` e `export const ACCENTS = ["#9b82ff","#3fd0c9","#ff8a4c","#4c9dff"] as const`
  - `export function QuickLauncher(props: { accent: string; hotkeyLabel: string; showNonce: number; onHide(): void; onOpenPanel(): void }): JSX.Element`
  - `tokens.css` define `--accent` (sobrescrito por inline style), `--glass-bg: rgba(26,31,43,0.74)`, `--glass-border: rgba(255,255,255,0.12)`, `--text: #f2f5fa`, `--text-muted: #9aa3b2`, `--radius-window: 16px`, `--radius-item: 10px`

Visual: seguir o artboard **D · Mistura** (https://claude.ai/artifact/8sDGAKGu36aDmnNiWDzHV9#artboard-Mistura). Janela 720×452, fundo `--glass-bg` sobre o vidro nativo (o `body` fica transparente), barra lateral de 168 px com "Vitra" e a categoria "Favoritos", busca no topo, área de favoritos com estado vazio ("Seus favoritos aparecem aqui. Abra o painel para adicionar."), fileira de botões de comandos do PC ainda **desativados** (vêm na Fase 3) e rodapé "↵ abrir · Esc fechar" + botão "Abrir painel ›".

- [ ] **Step 1: Write the failing tests**

```tsx
it("mostra a marca e a busca com placeholder")        // getByText("Vitra"); getByPlaceholderText("Buscar programas, pastas, sites…")
it("mostra o atalho recebido")                         // hotkeyLabel "Alt+Space" → getByText("Alt+Espaço") (Space→Espaço, Ctrl, Shift, Super→Win)
it("Esc chama onHide")                                 // keyDown Escape no documento → onHide chamado 1x
it("botão Abrir painel chama onOpenPanel")             // getByRole("button",{name:/Abrir painel/})
it("limpa e foca a busca ao reabrir")                  // digita "abc"; rerender com showNonce+1 → value "" e document.activeElement === input
it("aplica a cor de destaque")                         // accent "#3fd0c9" → raiz com style --accent: #3fd0c9
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`QuickLauncher` não existe)

- [ ] **Step 3: Implement `QuickLauncher` and scaffolding**

`showNonce` em `useEffect` limpa o estado da busca e dá `focus()` no input. Tradução do atalho para exibição numa função `formatHotkey(hotkey: string): string` exportada do mesmo arquivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json index.html src/
git commit -m "feat(ui): pop-up de vidro do Vitra"
```

---

### Task 4: Painel com Configurações (`Panel`)

**Files:**
- Create: `src/panel/Panel.tsx`, `src/panel/Panel.css`
- Test: `src/panel/Panel.test.tsx`

**Interfaces:**
- Consumes: `Settings`, `ACCENTS` (Task 3), `formatHotkey` (Task 3)
- Produces:
  - `export function Panel(props: { settings: Settings; hotkeyError: string | null; initialSection?: "itens" | "config"; onSave(next: Settings): Promise<string | null> }): JSX.Element`. `onSave` devolve `null` quando der certo ou a mensagem de erro do backend.

Layout: barra lateral (Vitra, "Itens", "Configurações"); a seção "Itens" mostra "Em breve: seus programas e categorias aparecem aqui." Em "Configurações":
- campo "Atalho para abrir o Vitra" + botão "Salvar atalho";
- interruptor "Abrir o Vitra quando o Windows iniciar";
- 4 bolinhas de cor (`ACCENTS`), com `aria-label` "Roxo", "Verde-água", "Laranja" e "Azul".

- [ ] **Step 1: Write the failing tests**

```tsx
it("abre em Configurações quando há erro de atalho")         // hotkeyError presente → seção config visível
it("mostra aviso de atalho indisponível")                    // hotkeyError "Não consegui usar o atalho Alt+Space. Escolha outro." → getByRole("alert") com esse texto
it("salva novo atalho")                                      // digita "Ctrl+Shift+K", clica Salvar atalho → onSave({...settings, hotkey:"Ctrl+Shift+K"})
it("mostra erro de atalho inválido")                         // onSave resolve "Use pelo menos Ctrl, Alt, Shift ou Win." → alert com o texto; campo mantém o valor digitado
it("alternar abrir com Windows salva na hora")               // clica no switch → onSave({...settings, autostart:false})
it("escolher cor salva na hora")                             // clica "Laranja" → onSave({...settings, accent:"#ff8a4c"}); a bolinha fica aria-pressed="true"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Panel`
Expected: FAIL (`Panel` não existe)

- [ ] **Step 3: Implement `Panel`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (12 testes no total)

- [ ] **Step 5: Commit**

```bash
git add src/panel
git commit -m "feat(ui): painel com configurações"
```

---

### Task 5: Casca Tauri (janelas, vidro, bandeja, atalho, autostart, instância única)

**Files:**
- Create: `src-tauri/Cargo.toml` (lib `vitra_lib`; deps: `tauri` 2.12 com feature `tray-icon`, os 3 plugins, `window-vibrancy` 0.8, `vitra-core` por path, `serde_json`), `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/{main,lib,windows,tray,shortcut,commands}.rs`, `src/lib/api.ts`, `src/main.tsx`, `app-icon.svg`, `src-tauri/icons/*`
- Modify: `Cargo.toml` (adicionar `src-tauri` ao workspace)

**Interfaces:**
- Consumes: `vitra_core::settings::{Settings, load, save, ACCENTS}`, `vitra_core::hotkey::normalize`, `vitra_core::geometry::{Rect, center_in_monitor}`, `QuickLauncher`, `Panel`
- Produces (comandos Tauri, nomes exatos):
  - `get_settings() -> Settings`
  - `save_settings(next: Settings) -> Result<Settings, String>`: normaliza o atalho, troca o registro (se falhar, mantém o antigo e devolve `"Não consegui usar o atalho {X}. Escolha outro."`), aplica o autostart, grava e emite `settings-changed` com as configurações salvas
  - `hide_quick()`, `open_panel()`
  - `get_hotkey_error() -> Option<String>`: erro do registro na inicialização
  - Eventos para o frontend: `quick-shown` (sem payload; o `QuickLauncher` incrementa `showNonce`), `settings-changed` (Settings)
- `src/lib/api.ts`: `getSettings()`, `saveSettings(s): Promise<string | null>`, `hideQuick()`, `openPanel()`, `getHotkeyError()`, `onQuickShown(cb)`, `onSettingsChanged(cb)`, `currentWindowLabel(): "quick" | "panel"`

`tauri.conf.json`:
- `productName` "Vitra", `identifier` "com.vitra.app", `bundle.targets` `["nsis"]`, `bundle.windows.nsis.languages` `["PortugueseBR"]`.
- Janela `quick`: 720×452, `decorations: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, `visible: false`, `shadow: true`.
- Janela `panel`: 1100×720, mínimo 800×560, título "Vitra", `visible: false`.

Comportamento:
- **setup:** carrega as configurações de `app_config_dir()/settings.json`; aplica `apply_mica(&quick, Some(true))` e, se falhar, `apply_acrylic(&quick, Some((26,31,43,180)))`; registra o atalho (falhou → guarda a mensagem e abre o painel); cria a bandeja; sincroniza o autostart com `settings.autostart`.
- **Atalho pressionado (`ShortcutState::Pressed`):** alterna o quick. Para mostrar: monitor sob o cursor → `center_in_monitor` → `set_position` → `show` → `set_focus` → emitir `quick-shown`.
- **Quick perde o foco** (`WindowEvent::Focused(false)`): esconder. **Fechar o painel** (`CloseRequested`): `prevent_close` + esconder; o app só sai pelo menu da bandeja.
- **Bandeja:** clique esquerdo alterna o quick; menu "Abrir painel", "Configurações" e "Sair".
- **Single-instance:** uma segunda execução mostra o quick.
- **Autostart:** `MacosLauncher::LaunchAgent` (ignorado no Windows) com argumento `--hidden`; o app sempre inicia escondido.

- [ ] **Step 1: Gerar ícones**

Run: `npx tauri icon app-icon.svg` (SVG: quadrado arredondado `#1a1f2b` com "V" em `#9b82ff`)
Expected: `src-tauri/icons/icon.ico` e PNGs criados

- [ ] **Step 2: Implement the modules and `src/main.tsx`**

`main.tsx`: `currentWindowLabel() === "quick"` → `<QuickLauncher>` ligado a `api`; senão `<Panel>`, com `initialSection="config"` quando `getHotkeyError()` devolver um valor.

- [ ] **Step 3: Verificar que o core e o frontend continuam verdes aqui**

Run: `cargo test -p vitra-core && npm test && npm run build`
Expected: PASS e `dist/` gerado

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml src-tauri src/main.tsx src/lib/api.ts app-icon.svg
git commit -m "feat(app): casca Tauri com bandeja, atalho global, autostart e vidro"
```

(A compilação da casca é verificada no CI da Task 6.)

---

### Task 6: CI no Windows gerando o instalador

**Files:**
- Create: `.github/workflows/build.yml`

Job `build` em `windows-latest`, rodando em `push` e `workflow_dispatch`:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 22, cache npm)
3. `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2` (workspaces `. -> target`)
4. `npm ci`
5. `npm test`
6. `cargo test -p vitra-core`
7. `tauri-apps/tauri-action@v0` (sem `tagName`, ou seja, não cria release)
8. `actions/upload-artifact@v4`, nome `Vitra-instalador`, path `target/release/bundle/nsis/*.exe`

- [ ] **Step 1: Write the workflow**

- [ ] **Step 2: Push and watch the run**

Run: `git push -u origin <branch>`, depois acompanhar o run com as ferramentas do GitHub (`actions_list` / `get_job_logs`)
Expected: job verde e artefato `Vitra-instalador` disponível. Se a casca não compilar, corrigir com base no log e repetir.

- [ ] **Step 3: Commit (se houver correções)**

```bash
git add -A && git commit -m "ci: build do instalador no Windows"
```

- [ ] **Step 4: Atualizar o README**

Seção "Como instalar": GitHub → Actions → último build verde → baixar `Vitra-instalador` → executar (aviso do SmartScreen: "Mais informações → Executar assim mesmo"). Incluir o checklist de teste manual da Fase 1:
- [ ] `Alt+Espaço` abre e fecha o pop-up
- [ ] Clicar fora e Esc escondem o pop-up
- [ ] O vidro aparece
- [ ] Ícone na bandeja com o menu
- [ ] Reiniciar o PC → o Vitra volta escondido
- [ ] Trocar atalho e cor no painel
- [ ] Abrir o Vitra duas vezes não cria uma segunda cópia

```bash
git add README.md && git commit -m "docs: como instalar e testar a Fase 1"
```
