# Vitra — Fase 2 (Itens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Vitra passa a conhecer os itens do dono: lista sozinho todos os programas instalados (com os ícones reais), deixa montar favoritos e categorias, adicionar programas, pastas, arquivos e sites (arrastando ou por botão), abrir tudo com um clique ou com `Alt+1…6`, e mostra os recentes.

**Architecture:** A biblioteca do dono (`library.json`) é um modelo puro em `vitra-core::library`, alterado só por operações (`LibOp`) aplicadas com `Library::apply`. Assim o frontend usa um único comando para tudo e cada operação é testável fora do Windows. As partes que só existem no Windows (descobrir os apps do Menu Iniciar e da Store via `shell:AppsFolder`, extrair ícones e abrir itens via `ShellExecuteW`) ficam em `src-tauri/src/win/`, atrás de `#[cfg(windows)]`, com stubs para outros sistemas. O frontend ganha componentes reutilizáveis (`ItemTile`, `ContextMenu`) usados pelo pop-up e pelo painel.

**Tech Stack:** Fase 1 + `windows` 0.62 (Shell/COM/GDI), `png` 0.18, `base64` 0.23, `tauri-plugin-dialog` 2.8 (+ `@tauri-apps/plugin-dialog`).

**Spec:** `docs/superpowers/specs/2026-11-26-vitra-design.md` (seções 5.2, 5.6, 5.10; fase 2 da seção 6)

## Global Constraints

- Tudo da Fase 1 continua valendo (interface em pt-BR, visual do artboard D, testes verdes no CI do Windows).
- Tipos de item nesta fase: programa, pasta, arquivo e site. Os modos/grupos ficam para a Fase 3.
- "Todos" = programas do Menu Iniciar (do usuário e de todos os usuários) + apps da Store, sem desinstaladores, "Leia-me", ajuda e afins.
- Favoritos é uma categoria especial e fixa; os 6 primeiros respondem a `Alt+1…6` no pop-up.
- Recentes: os últimos 8 itens abertos pelo Vitra.
- Menu de clique direito: Abrir · Abrir como administrador · Abrir local do arquivo · Adicionar/remover dos favoritos · Mover para categoria · Renomear · Remover do Vitra (+ "Esconder da lista" nos itens de "Todos").
- Dados em `%APPDATA%\Vitra\library.json`, com o mesmo backup `.bak` e a mesma gravação atômica das configurações; cache de ícones em `%LOCALAPPDATA%\Vitra\icons\`.
- Sites só abrem com `http`/`https`.
- O pop-up continua aparecendo rápido: descobrir os apps e extrair ícones nunca bloqueia a abertura (roda em segundo plano, com cache).

## Review Focus

1. **Item que não existe mais** (programa desinstalado, pasta apagada, pen drive removido): abrir mostra "Não encontrei este item. Ele foi movido ou apagado?" e não trava → teste `launch_missing_path_returns_friendly_error` (Task 3) e `ItemTile › mostra erro ao abrir` (Task 4).
2. **Arrastar o mesmo programa duas vezes**: não duplica, o item já existente é reaproveitado → `apply_add_same_target_twice_keeps_one` (Task 1).
3. **Remover um item que está nos favoritos, numa categoria e nos recentes**: some de todos os lugares, e `Alt+N` não abre um item fantasma → `apply_remove_cleans_everywhere` (Task 1).
4. **Nome de categoria vazio, repetido ou reservado** ("Favoritos", "Todos"): recusado com mensagem clara → `apply_create_category_rejects_*` (Task 1) e `Panel › mostra erro de categoria` (Task 6).
5. **`library.json` corrompido**: o app abre com o backup ou com a biblioteca vazia, sem travar → `load_library_corrupt_*` (Task 1).

---

## File Structure

```
crates/vitra-core/src/
  store.rs            load_json/save_json genéricos (atômico + .bak), usados por settings e library
  settings.rs         passa a usar store.rs
  library.rs          Item, ItemKind, Category, Library, LibOp, LibError, Library::apply
  items.rs            is_junk, classify_path, display_name, normalize_url, item_id
src-tauri/src/
  win/mod.rs          pub mod apps; pub mod icons; pub mod launch; (cfg(windows)) + stubs
  win/apps.rs         discover() -> Vec<Discovered>
  win/icons.rs        icon_png(target) -> Option<Vec<u8>>
  win/launch.rs       open(target, args, admin), reveal(path)
  library_cmds.rs     comandos da biblioteca
src/
  lib/types.ts        + Item, ItemKind, Category, Library, Discovered, LibOp
  lib/api.ts          + funções da biblioteca
  lib/useIcon.ts      hook com cache de ícones
  items/ItemTile.tsx (+ .css, .test.tsx)
  items/ContextMenu.tsx (+ .css, .test.tsx)
  quick/QuickLauncher.tsx   favoritos, categorias, Todos, recentes, Alt+1…6
  panel/ItemsSection.tsx (+ .css, .test.tsx)   seção "Itens" do painel
```

---

### Task 1: Biblioteca (`vitra-core::store`, `vitra-core::library`)

**Files:**
- Create: `crates/vitra-core/src/store.rs`, `crates/vitra-core/src/library.rs`
- Modify: `crates/vitra-core/src/settings.rs` (`load`/`save` passam a usar `store`; os testes existentes continuam verdes), `crates/vitra-core/src/lib.rs`

**Interfaces:**
- Produces:
  - `store::load_json<T: DeserializeOwned>(path: &Path) -> Option<T>` (tenta o principal e depois o `.bak`) e `store::save_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()>` (`.bak` só se o arquivo atual for JSON válido; gravação via `.tmp` + `rename`). Isso resolve o minor da Fase 1 sobre o `.bak` ruim.
  - `#[serde(rename_all = "lowercase")] enum ItemKind { App, Folder, File, Site }`
  - `#[serde(rename_all = "camelCase")] struct Item { id: String, name: String, kind: ItemKind, target: String, args: String, admin: bool }`
  - `struct Category { id: String, name: String, items: Vec<String> }`
  - `#[serde(default, rename_all = "camelCase")] struct Library { version: u32, items: Vec<Item>, favorites: Vec<String>, categories: Vec<Category>, recents: Vec<String>, hidden: Vec<String> }` (`Default`: version 1, resto vazio)
  - `#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")] enum LibOp {`
    `AddItem { item: Item }`, `RemoveItem { id }`, `RenameItem { id, name }`, `SetAdmin { id, admin: bool }`,
    `ToggleFavorite { id }`, `MoveFavorite { id, to: usize }`,
    `CreateCategory { name }`, `RenameCategory { id, name }`, `DeleteCategory { id }`,
    `AddToCategory { category, id }`, `RemoveFromCategory { category, id }`,
    `RecordLaunch { id }`, `Hide { id }`, `Unhide { id }` `}`
  - `enum LibError { NotFound, EmptyName, NameTooLong, DuplicateName, ReservedName }` com `Display` em pt-BR: "Item não encontrado.", "Dê um nome.", "Use no máximo 30 letras.", "Já existe uma categoria com esse nome.", "Esse nome é reservado."
  - `impl Library { pub fn apply(&mut self, op: LibOp) -> Result<Option<String>, LibError>; pub fn item(&self, id: &str) -> Option<&Item> }`: devolve `Some(id)` em `AddItem`/`CreateCategory`
  - `pub fn load_library(path: &Path) -> Library`, `pub fn save_library(path: &Path, lib: &Library) -> io::Result<()>`
  - `pub const MAX_RECENTS: usize = 8;`

Regras: `AddItem` com um id que já existe atualiza o nome e devolve o id existente. `RemoveItem` limpa `items`, `favorites`, `categories[*].items`, `recents` e `hidden`. `ToggleFavorite`/`AddToCategory` exigem que o item exista (`NotFound`). Nomes de categoria: aparados, 1–30 caracteres, únicos sem diferenciar maiúsculas, "Favoritos" e "Todos" reservados. Ids de categoria: `cat-<n>`, com n = maior n existente + 1. `RecordLaunch` põe o item na frente, sem repetir, com no máximo `MAX_RECENTS`. `MoveFavorite` limita `to` ao tamanho da lista.

- [ ] **Step 1: Write the failing tests** (em `library.rs` e `store.rs`)

```rust
fn app(id:&str)->Item // helper: Item{id, name:id.into(), kind:App, target:format!("C:\\{id}.exe"), args:"".into(), admin:false}
#[test] fn apply_add_same_target_twice_keeps_one()        // AddItem(app("a")) x2 → items.len()==1, devolve Some("a") nas duas
#[test] fn apply_toggle_favorite_adds_then_removes()
#[test] fn apply_toggle_favorite_unknown_is_not_found()
#[test] fn apply_move_favorite_reorders_and_clamps()      // favs [a,b,c]; Move{c,0} → [c,a,b]; Move{c,99} → [a,b,c]
#[test] fn apply_remove_cleans_everywhere()               // a em favorites, cat-1, recents, hidden → some de tudo
#[test] fn apply_create_category_assigns_incremental_ids() // "Jogos"→"cat-1", "Trabalho"→"cat-2"
#[test] fn apply_create_category_rejects_empty_dup_reserved_long() // "  ", "jogos" (dup), "Favoritos", "Todos", 31 letras
#[test] fn apply_rename_category_allows_same_name_other_case() // renomear "Jogos"→"JOGOS" no próprio cat-1 é aceito
#[test] fn apply_delete_category_keeps_items()
#[test] fn apply_record_launch_dedupes_and_caps_at_8()
#[test] fn apply_hide_and_unhide()
#[test] fn libop_deserializes_from_frontend_json()        // {"op":"addToCategory","category":"cat-1","id":"a"}
#[test] fn load_library_corrupt_falls_back_to_bak()
#[test] fn load_library_corrupt_without_bak_is_empty()
#[test] fn save_json_does_not_back_up_corrupt_file()      // principal "{oops", .bak bom → save → .bak continua o bom
```

- [ ] **Step 2:** Run `cargo test -p vitra-core` → FAIL (não compila)
- [ ] **Step 3:** Implement `store.rs`, `library.rs`; migrate `settings.rs` to `store`
- [ ] **Step 4:** Run `cargo test -p vitra-core` → PASS (todos os testes antigos + novos)
- [ ] **Step 5:** Commit `feat(core): biblioteca de itens, favoritos e categorias`

---

### Task 2: Regras de itens (`vitra-core::items`)

**Files:** Create `crates/vitra-core/src/items.rs`; modify `lib.rs`

**Interfaces:**
- Produces:
  - `pub fn is_junk(name: &str) -> bool`: sem diferenciar maiúsculas, contém algum de: `uninstall`, `desinstal`, `readme`, `read me`, `leia-me`, `leiame`, `help`, `ajuda`, `documentation`, `documentação`, `manual`, `website`, `release notes`, `license`, `licença`, `what's new`, `novidades`
  - `pub fn classify_path(path: &Path, is_dir: bool) -> ItemKind`: pasta → `Folder`; extensões `exe lnk bat cmd msc url appref-ms` → `App`; o resto → `File`
  - `pub fn display_name(path: &Path) -> String`: nome sem extensão para arquivos, nome da pasta para pastas; raiz de disco ("D:\\") → "Disco D:"
  - `pub fn normalize_url(input: &str) -> Result<String, UrlError>`: apara espaços; sem esquema → prefixa `https://`; só `http`/`https`; host com ponto ou `localhost`; sem espaços. `UrlError` com `Display` "Endereço inválido. Ex.: youtube.com"
  - `pub fn item_id(kind: ItemKind, target: &str) -> String`: `"{prefixo}-{fnv1a64 do alvo em minúsculas, 16 hex}"`, com prefixos `app` `dir` `file` `site`
  - `pub fn site_name(url: &str) -> String`: host sem `www.` e sem o TLD final, com a primeira letra maiúscula ("https://www.youtube.com/x" → "Youtube")

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn is_junk_matches_common_entries()      // "Uninstall Steam", "Desinstalar X", "Leia-me", "Ajuda do Office", "Website" → true
#[test] fn is_junk_keeps_real_apps()             // "Steam", "Spotify", "Microsoft Edge", "Discord" → false
#[test] fn classify_path_kinds()                 // dir → Folder; a.EXE → App; b.lnk → App; c.pdf → File
#[test] fn display_name_strips_extension()       // C:\x\Steam.lnk → "Steam"; C:\Faculdade (dir) → "Faculdade"; D:\ → "Disco D:"
#[test] fn normalize_url_adds_https()            // "youtube.com" → "https://youtube.com"
#[test] fn normalize_url_keeps_http()            // "http://localhost:3000" → igual
#[test] fn normalize_url_rejects_bad()           // "", "javascript:alert(1)", "file:///C:/x", "abc", "you tube.com" → Err
#[test] fn item_id_is_stable_and_case_insensitive() // item_id(App,"C:\\A.exe") == item_id(App,"c:\\a.EXE"), começa com "app-", 20 chars
#[test] fn site_name_from_url()
```

- [ ] **Step 2:** `cargo test -p vitra-core items` → FAIL
- [ ] **Step 3:** Implement (FNV-1a 64 à mão, sem dependência nova)
- [ ] **Step 4:** `cargo test -p vitra-core` → PASS
- [ ] **Step 5:** Commit `feat(core): regras de itens (lixo, tipos, sites, ids)`

---

### Task 3: Windows: descobrir apps, ícones e abrir itens

**Files:** Create `src-tauri/src/win/{mod,apps,icons,launch}.rs`; modify `src-tauri/Cargo.toml` (dependência `windows` 0.62 só em `[target.'cfg(windows)'.dependencies]`, com as features `Win32_Foundation`, `Win32_System_Com`, `Win32_UI_Shell`, `Win32_UI_Shell_Common`, `Win32_Graphics_Gdi`, `Win32_UI_WindowsAndMessaging`; mais `png` e `base64`)

**Interfaces:**
- Produces:
  - `pub struct Discovered { pub id: String, pub name: String, pub target: String }` (serde camelCase). `target` = `"shell:AppsFolder\\<nome de análise>"`, `id = item_id(App, target)`, para o frontend nunca calcular hash
  - `pub fn discover() -> Vec<Discovered>`: enumera `FOLDERID_AppsFolder` (`SHGetKnownFolderItem` → `BindToHandler(BHID_EnumItems)` → `IEnumShellItems`), pega `SIGDN_NORMALDISPLAY` e `SIGDN_PARENTRELATIVEPARSING`, descarta `is_junk`, remove nomes repetidos e ordena por nome (sem diferenciar maiúsculas). Inicializa COM com `CoInitializeEx(COINIT_APARTMENTTHREADED)` na thread que chamar.
  - `pub fn icon_png(target: &str, size: i32) -> Option<Vec<u8>>`: `SHCreateItemFromParsingName` → `IShellItemImageFactory::GetImage(SIZE{size,size}, SIIGBF_BIGGERSIZEOK | SIIGBF_ICONONLY)` → `GetDIBits` 32 bpp, de cima para baixo → BGRA→RGBA → PNG
  - `pub fn open(target: &str, args: &str, admin: bool) -> Result<(), String>`: `ShellExecuteW` com o verbo `"runas"` ou `"open"`. Retorno ≤ 32: `ERROR_FILE_NOT_FOUND`/`ERROR_PATH_NOT_FOUND` → "Não encontrei este item. Ele foi movido ou apagado?"; `SE_ERR_ACCESSDENIED` ou cancelado no UAC → "Abertura cancelada."; outro → "Não consegui abrir este item."
  - `pub fn reveal(path: &str) -> Result<(), String>`: `explorer.exe /select,"<path>"`
  - Fora do Windows, os stubs devolvem `vec![]` / `None` / `Err("Disponível só no Windows.")`
  - `vitra_core::items::launch_error_message(code: isize) -> Option<String>`: Rust puro, testável aqui; `win/launch.rs` usa essa função

- [ ] **Step 1: Write the failing tests** (em `crates/vitra-core/src/items.rs`)

```rust
#[test] fn launch_missing_path_returns_friendly_error() // launch_error_message(2) e (3) == Some("Não encontrei este item. Ele foi movido ou apagado?")
#[test] fn launch_access_denied_is_cancelled()          // launch_error_message(5) == Some("Abertura cancelada.")
#[test] fn launch_success_is_none()                     // launch_error_message(42) == None
```

- [ ] **Step 2:** `cargo test -p vitra-core launch` → FAIL
- [ ] **Step 3:** Implement `launch_error_message` in core; implement `win/*` with real Win32 calls
- [ ] **Step 4:** `cargo test -p vitra-core` → PASS; `cargo clippy -p vitra --target x86_64-pc-windows-msvc` → sem erros nem warnings
- [ ] **Step 5:** Commit `feat(win): descobrir apps, extrair ícones e abrir itens`

---

### Task 4: Comandos da biblioteca + componentes de item

**Files:**
- Create: `src-tauri/src/library_cmds.rs`, `src/lib/useIcon.ts`, `src/items/ItemTile.tsx`, `src/items/ItemTile.css`, `src/items/ItemTile.test.tsx`, `src/items/ContextMenu.tsx`, `src/items/ContextMenu.css`, `src/items/ContextMenu.test.tsx`
- Modify: `src-tauri/src/lib.rs` (estado com `library: Mutex<Library>`, `library_path`, `discovered: Mutex<Vec<Discovered>>`, `icon_dir`; plugin dialog; comandos registrados; a descoberta roda em `std::thread::spawn` na inicialização e emite `apps-discovered`), `src-tauri/capabilities/default.json` (+ `dialog:default`), `src/lib/types.ts`, `src/lib/api.ts`, `package.json` (+ `@tauri-apps/plugin-dialog`)

**Interfaces:**
- Produces (comandos Tauri):
  - `get_library() -> Library`, `get_discovered() -> Vec<Discovered>`, `rediscover()` (roda de novo em segundo plano)
  - `library_apply(op: LibOp) -> Result<Library, String>`: aplica, grava, emite `library-changed` com a `Library`
  - `launch_item(id: String, admin: bool) -> Result<(), String>`: procura na biblioteca e depois em `discovered` (id = `item_id(App, target)`). Abre e registra `RecordLaunch`; se o item veio de `discovered`, faz `AddItem` antes
  - `reveal_item(id) -> Result<(), String>` (só `App`/`File`/`Folder` com caminho de verdade; alvos `shell:AppsFolder\…` → "Não dá para abrir o local deste app.")
  - `get_icon(id) -> Option<String>`: data URL `data:image/png;base64,…`, com cache em disco `icon_dir/<id>.png`; sites → `None`
  - `add_paths(paths: Vec<String>, category: Option<String>) -> Result<Vec<String>, String>`: classifica, cria os itens (ids estáveis), põe na categoria (`"favoritos"` = favoritos) e devolve os ids
  - `add_site(name: String, url: String, category: Option<String>) -> Result<String, String>`: `normalize_url`; nome vazio → `site_name`
- `src/lib/types.ts`: `Item`, `ItemKind`, `Category`, `Library`, `Discovered` (`{ id, name, target }`) e `LibOp` (união discriminada por `op`, com os mesmos nomes camelCase do Rust)
- `useIcon(id: string): string | null`: cache em módulo; chama `api.getIcon` uma vez por id
- `ItemTile(props: { item: { id: string; name: string; kind: ItemKind }; badge?: string; size?: "big" | "row"; onOpen(): void; onContext(e: { x: number; y: number }): void; iconSrc?: string | null })`: sem ícone, mostra a inicial do nome num quadrado colorido (cor por hash do id, numa paleta fixa de 8 cores)
- `ContextMenu(props: { x: number; y: number; item: Item | Discovered; isFavorite: boolean; categories: Category[]; inCategory?: string; fromAll?: boolean; onAction(a: MenuAction): void; onClose(): void })` com `type MenuAction = "open" | "openAdmin" | "reveal" | "toggleFavorite" | { moveTo: string } | "removeFromCategory" | "rename" | "remove" | "hide"`

- [ ] **Step 1: Write the failing tests**

```tsx
// ItemTile.test.tsx
it("mostra a inicial quando não há ícone")                  // item "Steam" sem iconSrc → "S"
it("mostra o ícone quando há")                              // iconSrc data:… → <img alt=""> com src
it("clique abre, botão direito abre o menu")                // onOpen 1x; contextMenu → onContext({x,y})
it("mostra o número do atalho")                             // badge "1" → getByText("1")
it("Enter e espaço abrem (acessível)")                      // é <button>
it("mostra erro ao abrir")                                  // mostrado pelo pai: ver Quick (Task 5); aqui só onOpen
// ContextMenu.test.tsx
it("mostra as ações de um programa")                        // Abrir, Abrir como administrador, Abrir local do arquivo, Adicionar aos favoritos, Mover para, Renomear, Remover do Vitra
it("favorito mostra Remover dos favoritos")
it("item de Todos mostra Esconder da lista e não Remover")
it("site não mostra administrador nem local")
it("Mover para lista as categorias e chama onAction({moveTo})")
it("Esc fecha")
```

- [ ] **Step 2:** `npx vitest run src/items` → FAIL
- [ ] **Step 3:** Implement the components, types and api; implement `library_cmds.rs` and wire up `lib.rs`
- [ ] **Step 4:** `npx vitest run` → PASS; `cargo clippy -p vitra --target x86_64-pc-windows-msvc` → limpo; `cargo test -p vitra-core` → PASS
- [ ] **Step 5:** Commit `feat: comandos da biblioteca, ItemTile e menu de contexto`

---

### Task 5: Pop-up com itens de verdade

**Files:** Modify `src/quick/QuickLauncher.tsx`, `src/quick/QuickLauncher.css`, `src/quick/QuickLauncher.test.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `ItemTile`, `ContextMenu`, `useIcon`, `Library`, `Discovered`, `LibOp`
- Produces: novas props do `QuickLauncher`: `library: Library; discovered: Discovered[]; onLaunch(id: string, admin?: boolean): Promise<string | null>; onApply(op: LibOp): Promise<string | null>; onReveal(id: string): Promise<string | null>` (mantém as da Fase 1)

Comportamento:
- Barra lateral: Favoritos, as categorias do dono e Todos (com a quantidade).
- Favoritos: grade com os favoritos (até 12 visíveis, os 6 primeiros com selo 1–6) e, embaixo, até 5 Recentes. Sem favoritos, mantém o texto de vazio da Fase 1.
- Categoria: grade com os itens dela.
- Todos: lista rolável com os apps descobertos, sem os escondidos.
- Clique ou Enter abre e esconde o pop-up; `Alt+1…6` abre o favorito N. Se `onLaunch` devolver erro, mostra o erro num aviso (`role="alert"`) dentro do pop-up e não esconde.
- O menu de contexto aplica as ações via `onApply`/`onLaunch`/`onReveal`. "Renomear" abre um campo inline e salva com Enter.
- A busca continua só visual (a busca de verdade é da Fase 3).

- [ ] **Step 1: Write the failing tests** (os 8 da Fase 1 continuam e precisam continuar passando)

```tsx
it("lista favoritos com selos 1 a 6")
it("Alt+2 abre o segundo favorito e esconde")        // onLaunch("b") e depois onHide
it("mostra Recentes")                                // recents [c] → seção "Recentes" com "C"
it("trocar para uma categoria mostra os itens dela")
it("Todos mostra descobertos sem os escondidos")
it("erro ao abrir aparece e não esconde")            // onLaunch resolve "Não encontrei este item…" → alert, onHide não chamado
it("menu: adicionar aos favoritos chama onApply")    // contextMenu em item de Todos → "Adicionar aos favoritos" → onApply({op:"addItem"…}) e depois toggleFavorite
```

Para adotar um item de "Todos", o frontend manda `AddItem` com `{id, name, kind:"app", target, args:"", admin:false}` e depois a operação pedida.

- [ ] **Step 2:** `npx vitest run src/quick` → FAIL
- [ ] **Step 3:** Implement; wire up `main.tsx` (`library`/`discovered` com `onLibraryChanged`/`onAppsDiscovered`)
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5:** Commit `feat(ui): pop-up com favoritos, categorias, Todos e recentes`

---

### Task 6: Painel: seção "Itens"

**Files:** Create `src/panel/ItemsSection.tsx`, `src/panel/ItemsSection.css`, `src/panel/ItemsSection.test.tsx`; modify `src/panel/Panel.tsx` (a seção "Itens" usa `ItemsSection`; novas props repassadas), `src/main.tsx` (arrastar do Explorer: `getCurrentWebview().onDragDropEvent` → `addPaths` na categoria aberta)

**Interfaces:**
- Produces: `ItemsSection(props: { library: Library; discovered: Discovered[]; onApply(op: LibOp): Promise<string | null>; onLaunch(id: string, admin?: boolean): Promise<string | null>; onReveal(id: string): Promise<string | null>; onAddFiles(category: string, folders: boolean): Promise<string | null>; onAddSite(name: string, url: string, category: string): Promise<string | null>; onSelectCategory?(id: string): void })`. `onAddFiles` abre o seletor do Windows (`plugin-dialog` `open({ multiple: true, directory: folders })`) dentro do `api` e chama `add_paths`

Layout (padrão do painel da Fase 1):
- Coluna de categorias: Favoritos, as do dono e Todos, mais "+ Nova categoria" (campo inline).
- Clique duplo numa categoria renomeia; o menu dela tem "Renomear" e "Excluir categoria" (os itens continuam no Vitra).
- Área principal: título da categoria, botão "Adicionar ▾" (Programa ou arquivo / Pasta / Site) e a grade de `ItemTile` com o mesmo menu de contexto.
- Arrastar um tile para uma categoria da coluna = `AddToCategory`. Arrastar um tile sobre outro, dentro de Favoritos, = `MoveFavorite`.
- Texto de ajuda: "Arraste programas, pastas e arquivos do Windows para cá."
- Formulário de site: Nome (opcional) + Endereço; o erro do backend aparece em `role="alert"`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("cria categoria")                                   // + Nova categoria → digita "Jogos" → Enter → onApply({op:"createCategory",name:"Jogos"})
it("mostra erro de categoria")                         // onApply resolve "Já existe uma categoria com esse nome." → alert
it("renomeia categoria com clique duplo")
it("exclui categoria pelo menu")                       // onApply({op:"deleteCategory",id:"cat-1"})
it("adicionar site envia nome e endereço")             // onAddSite("", "youtube.com", "favoritos")
it("erro de site aparece")                             // onAddSite resolve "Endereço inválido. Ex.: youtube.com" → alert
it("Adicionar > Pasta chama onAddFiles com folders=true")
it("soltar tile numa categoria adiciona nela")         // drag de "a" para "Jogos" → onApply({op:"addToCategory",category:"cat-1",id:"a"})
```

- [ ] **Step 2:** `npx vitest run src/panel` → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → OK
- [ ] **Step 5:** Commit `feat(ui): painel de itens com categorias, adicionar e arrastar`

---

### Task 7: Build e checklist

- [ ] **Step 1:** `cargo test -p vitra-core && npx vitest run && npm run build && cargo clippy -p vitra --target x86_64-pc-windows-msvc` → tudo verde
- [ ] **Step 2:** Push; acompanhar o "Build do Vitra (Windows)" → verde, com o artefato `Vitra-instalador`
- [ ] **Step 3:** README: checklist da Fase 2:
  - [ ] "Todos" lista os programas com os ícones certos
  - [ ] Favoritar, criar categoria e mover entre categorias funcionam
  - [ ] Arrastar um programa, uma pasta e um arquivo do Windows para o painel
  - [ ] Adicionar um site
  - [ ] `Alt+1…6` funciona
  - [ ] "Abrir como administrador" e "Abrir local do arquivo" funcionam
  - [ ] Os recentes aparecem
- [ ] **Step 4:** Commit `docs: checklist da Fase 2`
