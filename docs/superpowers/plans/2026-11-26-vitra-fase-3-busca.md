# Vitra — Fase 3 (Busca e extras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A caixa de busca do pop-up passa a funcionar de verdade: acha itens e programas por pedaço do nome, por iniciais ou com erro de digitação, com o mais usado primeiro. Ela também faz contas, pesquisa na internet com palavras-chave (`yt lofi`) e executa comandos do PC. Os botões de comandos do PC passam a funcionar, e o dono pode criar **modos** (grupos de itens que abrem juntos).

**Architecture:** A busca é uma função pura em TypeScript (`src/search/`): recebe a biblioteca, os apps descobertos, os atalhos de internet e o texto digitado, e devolve uma lista ordenada de resultados tipados. A UI só desenha essa lista e navega nela pelo teclado. No Rust, `vitra-core` ganha contagem de uso, o tipo de item `mode`, os atalhos de internet nas configurações e o enum de comandos do sistema. `src-tauri/src/win/system.rs` executa os comandos do PC.

**Tech Stack:** o mesmo das Fases 1–2. A dependência `windows` ganha as features `Win32_System_Shutdown`, `Win32_System_Power` e `Win32_UI_Shell` (para o `SHEmptyRecycleBinW`, que já está nela).

**Spec:** `docs/superpowers/specs/2026-11-26-vitra-design.md` (seções 5.3, 5.4 e 5.5; fase 3 da seção 6)

## Global Constraints

- Ordem dos resultados (spec 5.3): **Calculadora → Atalho de internet → Itens e programas → Comandos do PC**. Os arquivos (Fase 4) e as senhas (Fase 5) ainda não entram.
- Palavras-chave padrão: `g` Google, `yt` YouTube, `w` Wikipédia, `m` Google Maps. O dono pode criar as suas.
- Teclado: ↑/↓ navegam, Enter abre, Ctrl+Enter abre como administrador, Shift+Enter abre o local do arquivo, Esc fecha.
- Comandos: Desligar, Reiniciar, Suspender, Bloquear, Sair da conta, Esvaziar lixeira. **Desligar, Reiniciar e Sair** pedem confirmação: um segundo clique (ou Enter) em até 3 s.
- Modo = lista de itens que abrem juntos com um clique; aparece como item e pode ser favorito.
- A calculadora nunca usa `eval`. Enter copia o resultado.
- Sites só com `http`/`https` (as palavras-chave passam por `normalize_url`).

## Review Focus

1. **Busca com acentos ou maiúsculas** ("calculadora" acha "Calculadora"; "musica" acha "Música"; "VSC" acha "Visual Studio Code") → `fuzzy › ignora acentos e maiúsculas`, `fuzzy › acha por iniciais` (Task 4).
2. **Texto que parece conta mas não é** ("2024 relatório", "1-1-2025", "a+b"): não vira calculadora e nunca trava → `calc › ignora textos que não são contas` (Task 4).
3. **Clique sem querer em Desligar**: não desliga sem o segundo clique; depois de 3 s, volta ao normal → `QuickLauncher › desligar pede confirmação` (Task 5).
4. **Modo com item apagado ou que não abre**: abre os outros e avisa quais falharam; um modo vazio avisa "Este modo não tem itens." → `mode_launch_message_*` (Task 2) e `remove_item_cleans_mode_members` (Task 1).
5. **Palavra-chave nova inválida** (vazia, com espaço, repetida, URL sem `{q}` ou `javascript:`): recusada com mensagem → `validate_shortcut_*` (Task 2).

---

## File Structure

```
crates/vitra-core/src/
  library.rs      + ItemKind::Mode, Item.members, Library.launches, CreateMode, SetModeMembers
  settings.rs     + WebShortcut, Settings.web_shortcuts (padrões g/yt/w/m), validate_shortcut
  system.rs       SystemCommand (+ needs_confirm, label)
  items.rs        + mode_launch_message
src-tauri/src/
  win/system.rs   run(SystemCommand)
  library_cmds.rs launch_item abre modos; open_url; run_system_command
src/search/
  normalize.ts, fuzzy.ts, calc.ts, web.ts, search.ts (+ .test.ts de cada um)
src/quick/QuickLauncher.tsx   resultados da busca + teclado + comandos com confirmação
src/quick/useConfirm.ts       confirmação de 3 s (compartilhada pelos botões e pela busca)
src/panel/ModeForm.tsx        criar/editar modo
src/panel/Panel.tsx           + editor de palavras-chave
```

---

### Task 1: Biblioteca: uso e modos (`vitra-core::library`)

**Interfaces (Produces):**
- `ItemKind::Mode` (serde `"mode"`); `Item.members: Vec<String>` (`#[serde(default)]`)
- `Library.launches: BTreeMap<String, u32>` (`#[serde(default)]`); `RecordLaunch` soma 1
- `LibOp::CreateMode { name, members: Vec<String> }` → `Some("mode-<n>")`; nome aparado e não vazio (`EmptyName`); membros precisam existir e não podem ser modos (`NotFound` / `LibError::ModeInMode` "Um modo não pode conter outro modo."); `target` = `""`
- `LibOp::SetModeMembers { id, members }` (mesmas regras; `id` precisa ser um modo)
- `RemoveItem` também tira o id dos `members` de todos os modos e de `launches`

**Tests:** `record_launch_counts_uses`, `create_mode_assigns_id_and_members`, `create_mode_rejects_empty_name_unknown_and_nested`, `set_mode_members_replaces`, `remove_item_cleans_mode_members`, `libop_create_mode_from_json` (`{"op":"createMode","name":"Estudo","members":["a"]}`), `old_library_without_launches_loads` (JSON da Fase 2 sem `launches`/`members` desserializa).

Steps: tests → `cargo test -p vitra-core` FAIL → implement → PASS → commit `feat(core): contagem de uso e modos`.

---

### Task 2: Configurações, comandos e mensagens (`vitra-core`)

**Interfaces (Produces):**
- `#[serde(rename_all = "camelCase")] struct WebShortcut { keyword: String, name: String, url: String }`
- `Settings.web_shortcuts: Vec<WebShortcut>` com os padrões, nesta ordem: `g` Google `https://www.google.com/search?q={q}`, `yt` YouTube `https://www.youtube.com/results?search_query={q}`, `w` Wikipédia `https://pt.wikipedia.org/w/index.php?search={q}`, `m` Google Maps `https://www.google.com/maps/search/{q}`. Um `settings.json` da Fase 1/2 sem o campo recebe os padrões.
- `pub fn validate_shortcut(s: &WebShortcut, others: &[WebShortcut]) -> Result<WebShortcut, String>`: palavra-chave aparada, em minúsculas, 1–10 caracteres alfanuméricos ("Use de 1 a 10 letras ou números, sem espaço."), única ("Essa palavra-chave já existe."); nome não vazio ("Dê um nome."); a URL passa em `normalize_url` depois de trocar `{q}` por `x` e precisa conter `{q}` ("O endereço precisa ter {q} onde entra a pesquisa.")
- `system.rs`: `#[serde(rename_all = "camelCase")] enum SystemCommand { Shutdown, Restart, Sleep, Lock, Logoff, EmptyRecycleBin }`, `fn needs_confirm(self) -> bool` (Shutdown, Restart, Logoff, EmptyRecycleBin), `fn label(self) -> &'static str` ("Desligar", "Reiniciar", "Suspender", "Bloquear", "Sair da conta", "Esvaziar lixeira")
- `items::mode_launch_message(total: usize, failed: &[String]) -> Option<String>`: `total == 0` → "Este modo não tem itens."; nenhuma falha → `None`; todas falharam → "Não consegui abrir nenhum item deste modo."; senão → "Abri {total - n} de {total}. Não abriram: {nomes separados por ", "}."

**Tests:** `settings_default_has_web_shortcuts`, `old_settings_get_default_shortcuts`, `validate_shortcut_accepts_and_normalizes`, `validate_shortcut_rejects_bad_keyword`, `validate_shortcut_rejects_duplicate`, `validate_shortcut_rejects_url_without_q_or_bad_scheme`, `system_command_confirm_and_labels`, `system_command_from_json` (`"emptyRecycleBin"`), `mode_launch_message_empty`, `mode_launch_message_partial`, `mode_launch_message_all_failed`, `mode_launch_message_ok`.

**Ruling já tomada aqui:** "Esvaziar lixeira" também pede confirmação (não dá para desfazer), além dos 3 que o spec lista.

Steps: tests → FAIL → implement → PASS → commit `feat(core): atalhos de internet, comandos do PC e mensagens de modo`.

---

### Task 3: Windows: comandos, abrir URL e abrir modos

**Files:** `src-tauri/src/win/system.rs` (+ fallback), `src-tauri/src/win/mod.rs`, `src-tauri/src/library_cmds.rs`, `src-tauri/src/commands.rs` (`save_settings` valida cada atalho com `validate_shortcut`), `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

**Interfaces (Produces):**
- `win::run_system(cmd: SystemCommand) -> Result<(), String>`: Shutdown `shutdown.exe /s /t 0`, Restart `/r /t 0`, Logoff `/l`, Lock `LockWorkStation`, Sleep `SetSuspendState(false, false, false)`, EmptyRecycleBin `SHEmptyRecycleBinW(None, None, SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND)` (a confirmação é a do Vitra; lixeira já vazia conta como sucesso)
- comando `run_system_command(cmd: SystemCommand) -> Result<(), String>`, em `spawn_blocking`
- comando `open_url(url: String) -> Result<(), String>`: `normalize_url` e depois `win::open`
- `launch_item` com um modo: abre cada membro em ordem (os que existem), junta os nomes que falharam, registra só o uso do modo e devolve `mode_launch_message`

Verificação: `cargo clippy -p vitra --target x86_64-pc-windows-msvc` limpo; `cargo test -p vitra-core` verde. Commit `feat(win): comandos do PC, abrir URL e abrir modos`.

---

### Task 4: Motor de busca (`src/search/`)

**Interfaces (Produces):**
- `normalize.ts`: `normalize(s: string): string` (minúsculas, sem acentos e espaços repetidos)
- `fuzzy.ts`: `score(query: string, name: string): number`, onde 0 = não combina. Faixas: igual 100, começa com 90, começo de palavra 80, iniciais 75 (`vsc` → "Visual Studio Code"), contém 60, subsequência 40 (só com 3+ letras), um erro de digitação (Damerau ≤ 1 contra o começo de cada palavra, só com 4+ letras) 30
- `calc.ts`: `calculate(input: string): number | null` (parser recursivo: `+ - * / ^ %`, parênteses, menos unário, decimal com `,` ou `.`, `x`/`×` multiplica e `÷` divide). Só responde se houver dígito **e** operador e o texto inteiro for uma expressão; divisão por zero ou resultado não finito → `null`. `formatNumber(n: number): string` em pt-BR com até 10 dígitos significativos
- `web.ts`: `matchShortcut(input: string, shortcuts: WebShortcut[]): { shortcut: WebShortcut; query: string; url: string } | null`: a 1ª palavra é a palavra-chave (sem diferenciar maiúsculas) e o resto não pode ser vazio; `url` = troca `{q}` por `encodeURIComponent(resto)`
- `search.ts`:
  ```ts
  type SearchResult =
    | { type: "calc"; id: "calc"; value: number; text: string }
    | { type: "web"; id: string; title: string; url: string }
    | { type: "item"; id: string; entry: Entry; score: number }
    | { type: "command"; id: string; command: SystemCommand; label: string };
  function search(input: string, ctx: { library: Library; discovered: Discovered[]; shortcuts: WebShortcut[] }, limit = 30): SearchResult[]
  ```
  Itens = biblioteca + descobertos ainda não adotados, sem os escondidos. Ordem: `score + 6 * log2(1 + launches)`, depois o nome mais curto. Comandos combinam pelo rótulo com a mesma `score`. Vazio → `[]`
- `src/lib/types.ts`: `WebShortcut`, `SystemCommand`, `SYSTEM_COMMANDS` (id, rótulo, `needsConfirm`), `Item.members`, `Library.launches`, `ItemKind` + `"mode"`, `LibOp` + `createMode`/`setModeMembers`, `Settings.webShortcuts`

**Tests:** `fuzzy › igual, prefixo, palavra, iniciais, contém`, `fuzzy › ignora acentos e maiúsculas`, `fuzzy › acha por iniciais`, `fuzzy › tolera um erro de digitação`, `fuzzy › não combina lixo`; `calc › contas básicas` (`2+2`→4, `250*12`→3000, `10/4`→2.5, `2^10`→1024, `(1+2)*3`→9, `-5+2`→-3, `1,5*2`→3, `50%`→0.5, `3x4`→12), `calc › ignora textos que não são contas` (`2024`, `2024 relatório`, `1-1-2025` e `10/12/2024`, que a regra "parece data" `^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$` ignora, `a+b`, `spotify` → todos `null`), `calc › divisão por zero é null`, `calc › formata em pt-BR` (2.5 → "2,5"; 1234567 → "1.234.567"); `web › yt lofi`, `web › sem texto não combina`, `web › codifica a pesquisa`; `search › ordem calc, web, itens, comandos`, `search › mais usado primeiro`, `search › esconde escondidos e não duplica adotados`, `search › acha comando desligar`.

Steps: tests → `npx vitest run src/search` FAIL → implement → PASS → commit `feat(busca): motor de busca, calculadora e atalhos de internet`.

---

### Task 5: Pop-up: busca, teclado e comandos

**Files:** `src/quick/QuickLauncher.tsx` (+ css, testes), `src/quick/useConfirm.ts`, `src/lib/api.ts` (`runSystemCommand`, `openUrl`), `src/main.tsx`

**Interfaces:**
- Consumes: `search`, `SearchResult`, `SYSTEM_COMMANDS`
- Produces: novas props `shortcuts: WebShortcut[]`, `onSystem(cmd: SystemCommand): Promise<string | null>`, `onOpenUrl(url: string): Promise<string | null>`, `onCopy(text: string): Promise<void>`
- `useConfirm(ms = 3000): { armed: string | null; ask(key: string): boolean }`: `ask` devolve `true` se a mesma chave já estava armada (e então desarma); senão arma e agenda o desarme

Comportamento:
- Com texto na busca, a área de conteúdo mostra só os resultados, em linhas com título de grupo (Calculadora, Internet, Itens, Comandos). O 1º fica selecionado; ↑/↓ movem a seleção (com rolagem até ela).
- Enter executa: calc → copia e mostra "Copiado!"; web → `onOpenUrl` e esconde; item → abre (Ctrl = admin, Shift = local); comando → se precisa de confirmação, a 1ª vez arma ("Pressione Enter de novo para desligar") e a 2ª executa.
- Sem resultados: "Nada encontrado. Dica: g + espaço + texto pesquisa no Google."
- Os botões de comando ficam ativos; os que precisam de confirmação mudam de aparência e de rótulo (`aria-label` "Clique de novo para desligar") por 3 s.
- `Alt+1…6` continua funcionando com texto na busca.

**Tests:** `mostra resultados ao digitar`, `setas e Enter abrem o selecionado`, `Ctrl+Enter abre como administrador`, `calc: Enter copia`, `web: Enter abre a pesquisa`, `desligar pede confirmação` (1º clique não chama `onSystem`; 2º chama com `"shutdown"`; com timers falsos, depois de 3 s o 1º clique arma de novo), `bloquear não pede confirmação`, `nada encontrado mostra dica`, + todos os testes antigos.

Commit `feat(ui): busca no pop-up com teclado e comandos do PC`.

---

### Task 6: Painel: modos e palavras-chave

**Files:** `src/panel/ModeForm.tsx` (+ testes), `src/panel/ItemsSection.tsx` (Adicionar ▾ → "Modo (grupo de itens)"; menu de contexto de um modo → "Editar modo"), `src/items/ContextMenu.tsx` (`kind === "mode"` → mostra "Editar modo", esconde administrador e local), `src/panel/Panel.tsx` (+ seção "Palavras-chave de pesquisa" em Configurações)

**Interfaces:**
- `ModeForm(props: { library: Library; initial?: Item; onSubmit(name: string, members: string[]): Promise<string | null>; onCancel(): void })`: campo Nome e uma lista de caixas de seleção com os itens da biblioteca (sem modos), na ordem em que foram marcados
- Panel: a lista de palavras-chave mostra keyword, nome e URL, com "Remover"; o formulário "Nova palavra-chave" salva via `onSave({...settings, webShortcuts: [...]})`, e o erro do backend aparece em `role="alert"`

**Tests:** `ModeForm › cria modo com itens marcados`, `ModeForm › edita modo existente`, `ModeForm › nome vazio mostra erro do backend`; `ContextMenu › modo mostra Editar modo`; `Panel › adiciona palavra-chave`, `Panel › remove palavra-chave`, `Panel › mostra erro de palavra-chave`; `ItemsSection › Adicionar > Modo abre o formulário`.

Commit `feat(ui): modos e palavras-chave no painel`.

---

### Task 7: Build e checklist

- `cargo test -p vitra-core && npx vitest run && npm run build && cargo clippy -p vitra --target x86_64-pc-windows-msvc` → verde
- README: checklist da Fase 3 (busca por pedaço/iniciais/erro, `yt lofi`, `250*12`, botões de comando com confirmação, criar e abrir um modo, palavra-chave nova)
- Push → CI verde com o artefato. Commit `docs: checklist da Fase 3`.
