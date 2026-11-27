# Checklist de testes manuais

O que conferir à mão num Windows de verdade, fase por fase (o que o CI não consegue testar sozinho).

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

## Checklist de teste da Fase 5 (Senhas)

- [ ] Painel → **Senhas**: se pedir, clique em **Instalar ferramenta do Bitwarden**
- [ ] **Criar conta grátis** abre o site do Bitwarden; crie a conta lá e depois entre pelo Vitra
- [ ] Entrar com e-mail e senha mestra (se tiver 2FA, o Vitra pede o código)
- [ ] Adicione uma conta em **Abrir no Bitwarden**, depois **Sincronizar**: ela aparece na lista
- [ ] **Senha** copia; depois de 30 s a área de transferência fica vazia
- [ ] Busca do pop-up (com o cofre aberto): digite o nome da conta, Enter copia a senha, Shift+Enter copia o usuário
- [ ] Depois do tempo configurado sem usar, o cofre trava sozinho e pede a senha mestra de novo

**Segurança:** o Vitra nunca grava sua senha mestra, a sessão nem as senhas em disco. As senhas ficam só na memória do Vitra enquanto o cofre está aberto, e a tela nunca recebe a senha: quem copia é o próprio Vitra.
