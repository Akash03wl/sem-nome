# Vitra

Launcher para Windows: todos os seus programas, pastas, arquivos, sites e senhas num só lugar, com visual de vidro.

- Documento do projeto: [docs/superpowers/specs/2026-11-26-vitra-design.md](docs/superpowers/specs/2026-11-26-vitra-design.md)
- Plano da Fase 1: [docs/superpowers/plans/2026-11-26-vitra-fase-1-base.md](docs/superpowers/plans/2026-11-26-vitra-fase-1-base.md)

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

## Para desenvolver

Requisitos: Node 22, Rust estável e (no Windows) WebView2.

```bash
npm install
npm test                    # testes da interface
cargo test -p vitra-core    # testes do núcleo
npm run tauri dev           # abre o app em modo desenvolvimento (Windows)
```

Estrutura:

- `crates/vitra-core/`: lógica pura em Rust (configurações, atalhos, geometria), testável em qualquer sistema
- `src-tauri/`: o app em si (janelas, bandeja, atalho global, início com o Windows)
- `src/`: a interface (React + TypeScript)
