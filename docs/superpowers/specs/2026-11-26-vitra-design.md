# Vitra — Documento do projeto

> Status: rascunho para aprovação · 2026-11-26
> Mockups do visual: https://claude.ai/artifact/8sDGAKGu36aDmnNiWDzHV9 (artboard **D · Mistura** é o escolhido)

## 1. O que é e por quê

**Vitra** é um app para Windows que reúne num só lugar tudo o que o dono abre no dia a dia: programas, jogos, pastas, arquivos, sites e comandos do PC.

**Por quê:**
- Não depender da barra de pesquisa do Windows para achar as coisas.
- Manter a área de trabalho **limpa**, sem atalhos espalhados.
- Ter um visual bonito e agradável, que dê vontade de usar.

**Como é usado:**
- Abre sozinho quando o PC liga e fica escondido na bandeja (perto do relógio).
- **Modo rápido (pop-up):** `Alt+Espaço` mostra uma caixa de vidro no centro da tela, com busca, favoritos, categorias e recentes. Abriu algo, clicou fora ou apertou Esc, e ela some.
- **Modo painel:** uma janela grande para organizar tudo (categorias, arrastar itens, configurações, senhas).
- Os dois modos mostram os mesmos dados.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos (v1)**
1. Pop-up abre instantaneamente com o atalho global e qualquer item abre com poucas teclas.
2. Programas instalados aparecem sozinhos (aba "Todos"), com os ícones reais.
3. O dono monta as próprias categorias (Favoritos, Jogos, Trabalho, Pastas, Sites…) arrastando programas, pastas, arquivos e links.
4. Busca única que acha: itens do Vitra, programas instalados, arquivos do PC (via Everything), atalhos de internet e contas do Bitwarden.
5. Extras: modos/grupos, atalhos de internet, calculadora, botões de comandos do PC e menu de clique direito.
6. Aba de senhas integrada ao Bitwarden, com o visual do Vitra.

**Não-objetivos (ficam para depois)**
- Backup/sincronização das configurações do Vitra na nuvem.
- Temas além da cor de destaque.
- macOS e Linux.
- Sistema de plugins de terceiros.

**Anti-objetivos (o app falharia, mesmo funcionando, se…)**
- O pop-up demorar a aparecer (meta: visível em menos de ~150 ms após o atalho).
- Pesar no PC enquanto fica parado na bandeja (meta: menos de ~80 MB de RAM em repouso).
- Virar uma bagunça: ele existe para ser *mais limpo* que a área de trabalho.
- O Vitra guardar senhas por conta própria: as senhas ficam **só** no Bitwarden.

## 3. Restrições

- Windows 10 e 11 (efeito de vidro completo no 11; no 10, fundo translúcido mais simples).
- Interface em **português (Brasil)**.
- O dono não programa no próprio PC: o instalador é gerado pelo GitHub Actions e só precisa ser baixado.
- Instalador sem assinatura digital no começo: o Windows SmartScreen vai mostrar um aviso na primeira instalação ("Mais informações → Executar assim mesmo").

## 4. Abordagens consideradas

| Abordagem | Prós | Contras |
|---|---|---|
| **Tauri v2 (Rust + interface web)** ✅ | Leve (usa o WebView2 do Windows); efeito Mica/Acrílico nativo; plugins oficiais de autostart, atalho global, bandeja e instância única; visual livre com HTML/CSS | Parte "Windows" em Rust exige mais cuidado |
| Electron | Ecossistema enorme, muito exemplo | Pesado (~150 MB+ de RAM o tempo todo), ruim para app sempre aberto |
| C# / WinUI 3 | 100% nativo do Windows | Mais difícil de chegar no visual dos mockups; menos flexível |

**Escolhido: Tauri v2** (escolha do Claude, já que o dono deixou a parte técnica com ele), pelo peso baixo e pelo efeito de vidro nativo.

**Senhas, abordagens:** (A) integrar com o Bitwarden ou (B) cofre próprio com senha mestra e arquivo na nuvem. **O dono escolheu A**: a criptografia fica com um serviço auditado, e ainda vêm junto o app no celular e o preenchimento automático no navegador.

**Busca de arquivos:** o dono escolheu o **Everything** (voidtools).

## 5. Decisões já tomadas

### 5.1 Visual (artboard "D · Mistura")
- Base **vidro escuro**: janela translúcida (Mica/Acrílico no Win11), cantos arredondados de 16 px, borda sutil e sombra.
- **Barra lateral** de categorias à esquerda, com o nome "Vitra" no topo e "+ Nova categoria" no rodapé.
- No conteúdo: **busca** no topo, **favoritos** em grade com ícones grandes e número do atalho (`Alt+1…6`), lista de **Recentes** e um rodapé com dicas de teclado e "Abrir painel ›".
- **Cor de destaque** configurável (padrão roxo `#9b82ff`; opções verde-água, laranja e azul).
- Fonte: Inter no texto, Space Grotesk no nome e nos títulos.
- **Botões de comandos do PC** numa fileira de ícones no rodapé do pop-up (a acrescentar ao mockup) e também no painel.

### 5.2 Itens
- Tipos de item: **programa** (.exe / atalho .lnk / app da Microsoft Store), **pasta**, **arquivo**, **site** (URL) e **modo** (grupo de itens).
- **Automático:** o Vitra lê os atalhos do Menu Iniciar (do usuário e de todos os usuários) e os apps da Store (`shell:AppsFolder`) e mostra tudo na categoria "Todos". Entradas óbvias de lixo (desinstaladores, "Leia-me", links de ajuda) são escondidas por padrão.
- **Manual:** o dono arrasta para o Vitra um programa, pasta, arquivo ou link, ou usa o botão "Adicionar".
- Cada item pode ter: nome, ícone (extraído automaticamente ou trocado), categoria(s), argumentos de inicialização e "abrir como administrador".
- **Favoritos** é uma categoria especial, e os 6 primeiros ganham `Alt+1…6` no pop-up.
- **Recentes:** os últimos itens abertos pelo Vitra.

### 5.3 Busca (caixa única)
Ao digitar, os resultados aparecem agrupados nesta ordem:
1. **Calculadora:** se o texto é uma conta (`250*12`), mostra o resultado; Enter copia.
2. **Atalho de internet:** se começa com uma palavra-chave (`yt lofi`, `g receita`), Enter abre a pesquisa no navegador padrão. Padrões: `g` Google, `yt` YouTube, `w` Wikipédia, `m` Google Maps. O dono pode criar os seus.
3. **Itens do Vitra e programas instalados:** busca aproximada (tolera erro de digitação e acha por iniciais), com o mais usado primeiro.
4. **Comandos do PC** (também achados pelo nome).
5. **Arquivos do PC** via Everything (mais ou menos os 20 primeiros resultados).
6. **Senhas** (Bitwarden), só se o cofre estiver desbloqueado; mostra o nome da conta e, ao escolher, copia o usuário ou a senha.

Teclado: ↑/↓ navega, Enter abre, Ctrl+Enter abre como admin, Shift+Enter abre a pasta onde o item está, Esc fecha.

### 5.4 Comandos do PC (botões)
Desligar, Reiniciar, Suspender, Bloquear, Sair da conta, Esvaziar lixeira.
**Desligar, Reiniciar e Sair** pedem confirmação rápida (segundo clique em até 3 s, ou diálogo pequeno), porque podem fazer perder trabalho.

### 5.5 Modos / grupos
Um "modo" é uma lista de itens que abrem juntos com um clique (ex.: "Modo estudo" = Chrome + pasta Faculdade + Spotify). Aparece como item e pode ser favorito.

### 5.6 Menu de clique direito em qualquer item
Abrir · Abrir como administrador · Abrir local do arquivo · Adicionar/remover dos favoritos · Mover para categoria · Editar · Remover do Vitra.

### 5.7 Busca de arquivos: Everything
- O Vitra conversa com o Everything que estiver rodando (SDK/IPC do Everything 1.4+).
- Se o Everything não estiver instalado, a seção "Arquivos" mostra um aviso com botão **"Instalar Everything"**, que abre a página oficial ou roda o instalador baixado.
- Alternativa sem Everything (busca indexada do próprio Windows): desejável, mas **opcional na v1** (decisão do construtor, conforme o custo).

### 5.8 Senhas: Bitwarden
- Integração pela **CLI oficial do Bitwarden (`bw`)**. O Vitra detecta a CLI ou oferece baixá-la.
- Primeiro uso: o dono faz login no Bitwarden pela tela do Vitra. No dia a dia, desbloqueia o cofre com a senha mestra.
- **O Vitra nunca grava a senha mestra nem as senhas em disco.** A chave de sessão do `bw` fica só na memória.
- Aba **"Senhas"** no painel, com o visual do Vitra: lista com busca, ícone/nome do site, e botões **Copiar usuário**, **Copiar senha**, **Copiar código 2FA** (se houver) e **Abrir site**.
- Segurança: o cofre trava sozinho depois de **5 minutos** sem uso (configurável), e a senha copiada é apagada da área de transferência depois de **30 segundos**.
- Criar e editar contas: na v1, um botão "Abrir no Bitwarden" resolve; criar/editar pelo Vitra pode vir depois.

### 5.9 Sistema
- **Abre com o Windows** (plugin autostart), já escondido na bandeja.
- **Instância única:** abrir o Vitra de novo só mostra o pop-up.
- **Bandeja:** clique esquerdo abre o pop-up; o menu tem Abrir painel, Configurações e Sair.
- **Atalho global** configurável, padrão `Alt+Espaço`. Atenção: o Windows usa `Alt+Espaço` para o menu da janela e o PowerToys Run também o usa. O Vitra registra o atalho e, se falhar, avisa e pede outro.
- **Configurações (no painel):** atalho, cor de destaque, abrir com o Windows, palavras-chave de internet, itens escondidos, status do Everything, conta do Bitwarden e tempo de bloqueio.

### 5.10 Dados
- Configuração e itens num arquivo JSON em `%APPDATA%\Vitra\` (com backup automático da versão anterior a cada gravação).
- Cache de ícones em `%LOCALAPPDATA%\Vitra\icons\`.
- Nada de senhas nesses arquivos.

### 5.11 Entrega
- Repositório no GitHub (hoje `sem-nome`, a renomear para `vitra` pelo dono).
- **GitHub Actions** compila no Windows e gera o instalador (`.exe` NSIS) a cada push; o dono baixa o instalador direto do GitHub.

## 6. Fases

1. **Base:** projeto Tauri, pop-up de vidro com atalho global, bandeja, autostart, instância única, painel vazio e CI gerando o instalador.
2. **Itens:** leitura do Menu Iniciar e da Store, ícones reais, categorias, favoritos, recentes, arrastar e soltar, modo painel de organização e menu de clique direito.
3. **Busca e extras:** busca aproximada, atalhos de internet, calculadora, botões de comandos do PC e modos/grupos.
4. **Everything:** busca de arquivos.
5. **Bitwarden:** aba de senhas.
6. **Teste no PC do dono** e ajustes.

## 7. Decisões deixadas ao construtor

- Framework da interface (sugestão: React + TypeScript + Vite) e biblioteca de arrastar e soltar.
- Algoritmo de busca aproximada (no frontend ou no Rust).
- Como extrair os ícones (crate `win-icon-extractor` ou `SHGetFileInfo`/`IShellItemImageFactory` diretamente).
- Forma de falar com o Everything (DLL do SDK ou `es.exe`) e com o Bitwarden (`bw` direto ou `bw serve` em `127.0.0.1`).
- Parser seguro da calculadora (nunca `eval`).
- Testes: unitários no Rust (leitura de atalhos, filtros, config) e no frontend (busca, calculadora, palavras-chave); o CI roda tudo no Windows.

## 8. Decisões que o Claude tomou (o dono pode mudar)

- Atalho padrão `Alt+Espaço`; pop-up some ao perder o foco.
- Confirmação em Desligar, Reiniciar e Sair.
- Esconder desinstaladores e afins na aba "Todos".
- Bloqueio do cofre em 5 min e limpeza da área de transferência em 30 s.
- Palavras-chave padrão `g`, `yt`, `w`, `m`.
- Dados em JSON no `%APPDATA%\Vitra`.
