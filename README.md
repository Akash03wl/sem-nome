# Vitra

Launcher para Windows: todos os seus programas, pastas, arquivos, sites e senhas num só lugar, com visual de vidro.

- Documento do projeto: [docs/superpowers/specs/2026-11-26-vitra-design.md](docs/superpowers/specs/2026-11-26-vitra-design.md)
- Plano da Fase 1: [docs/superpowers/plans/2026-11-26-vitra-fase-1-base.md](docs/superpowers/plans/2026-11-26-vitra-fase-1-base.md)
- Plano da Fase 2: [docs/superpowers/plans/2026-11-26-vitra-fase-2-itens.md](docs/superpowers/plans/2026-11-26-vitra-fase-2-itens.md)
- Plano da Fase 3: [docs/superpowers/plans/2026-11-26-vitra-fase-3-busca.md](docs/superpowers/plans/2026-11-26-vitra-fase-3-busca.md)
- Plano da Fase 4: [docs/superpowers/plans/2026-11-26-vitra-fase-4-arquivos.md](docs/superpowers/plans/2026-11-26-vitra-fase-4-arquivos.md)

## Como instalar

1. No GitHub, abra a aba **Actions**.
2. Clique no último **"Build do Vitra (Windows)"** com ✅ verde.
3. Em **Artifacts**, baixe **Vitra-instalador** (vem em `.zip`) e extraia.
4. Execute o `Vitra_…_x64-setup.exe`.
   - O Windows pode mostrar "O Windows protegeu o computador" (o app ainda não tem assinatura digital): clique em **Mais informações → Executar assim mesmo**.

Depois de instalado, o Vitra fica perto do relógio. Aperte **Alt+Espaço** para abrir.

## Checklist de teste da Fase 1

- [ ] `Alt+Espaço` abre e fecha o pop-up
- [ ] Clicar fora ou apertar Esc esconde o pop-up
- [ ] O efeito de vidro aparece
- [ ] O ícone aparece perto do relógio, com o menu (Abrir painel, Configurações, Sair)
- [ ] Reiniciar o PC → o Vitra volta sozinho, escondido
- [ ] No painel, trocar o atalho e a cor de destaque funciona
- [ ] Abrir o Vitra duas vezes não cria uma segunda cópia

## Checklist de teste da Fase 2

- [ ] Em **Todos** aparecem seus programas, com os ícones certos
- [ ] Favoritar, criar categoria e mover itens entre categorias
- [ ] Arrastar um programa, uma pasta e um arquivo do Windows para o painel
- [ ] Adicionar um site (ex.: `youtube.com`)
- [ ] `Alt+1…6` abre os favoritos no pop-up
- [ ] Clique direito → "Abrir como administrador" e "Abrir local do arquivo"
- [ ] Os **Recentes** aparecem depois de abrir alguns itens
- [ ] Arrastar um favorito sobre outro muda a ordem

## Checklist de teste da Fase 3

- [ ] Buscar por pedaço do nome (`spot`), por iniciais (`vsc` → Visual Studio Code) e com erro (`spotfy`)
- [ ] ↑/↓ + Enter abre; Ctrl+Enter abre como administrador; Shift+Enter abre o local
- [ ] `yt lofi` abre o YouTube pesquisando "lofi"; `g receita de bolo` abre o Google
- [ ] `250*12` mostra 3.000 e Enter copia
- [ ] Botões de comando: Bloquear e Suspender funcionam direto; Desligar/Reiniciar/Sair/Lixeira pedem um 2º clique
- [ ] Criar um modo (Adicionar ▾ → Modo) e abrir: os itens abrem juntos
- [ ] Criar uma palavra-chave nova em Configurações (ex.: `gh` → `github.com/search?q={q}`)

## Checklist de teste da Fase 4

- [ ] Painel → Configurações → "Busca de arquivos (Everything)": se pedir, clique em **Instalar Everything** (ou **Abrir Everything**)
- [ ] Buscar um arquivo pelo nome (ex.: `relatório`): aparece em **Arquivos**, no fim da lista
- [ ] Enter abre o arquivo; Shift+Enter abre a pasta dele
- [ ] Fechar o Everything e buscar de novo: aparece "O Everything está fechado." com o botão **Abrir Everything**

Onde o Vitra guarda seus dados: `%APPDATA%\Vitra` (configurações e itens) e `%LOCALAPPDATA%\Vitra\icons` (ícones).

## Para desenvolver

Requisitos: Node 22, Rust estável e (no Windows) WebView2.

```bash
npm install
npm test                    # testes da interface
cargo test -p vitra-core    # testes do núcleo
npm run tauri dev           # abre o app em modo desenvolvimento (Windows)
```

Para a busca de arquivos funcionar em `tauri dev`, baixe o [SDK do Everything](https://www.voidtools.com/Everything-SDK.zip) e copie `dll\Everything64.dll` para `src-tauri\resources\` (o CI faz isso sozinho).

Estrutura:

- `crates/vitra-core/`: lógica pura em Rust (configurações, biblioteca de itens, atalhos, regras de itens), testável em qualquer sistema
- `src-tauri/`: o app em si (janelas, bandeja, atalho global, início com o Windows); `src-tauri/src/win/` tem o que só existe no Windows (apps instalados, ícones, abrir itens)
- `src/`: a interface (React + TypeScript)
