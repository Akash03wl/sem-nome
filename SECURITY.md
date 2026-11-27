# Segurança

O Vitra lida com o seu cofre de senhas (pelo Bitwarden), então segurança é prioridade.

## Como o Vitra protege as suas senhas

- A senha mestra, a sessão do cofre e as senhas **nunca são gravadas em disco** pelo Vitra.
- As senhas ficam só na memória do Vitra enquanto o cofre está aberto, e **a interface nunca recebe a senha**: quem copia é o próprio Vitra.
- A senha mestra vai para a ferramenta oficial do Bitwarden por variável de ambiente, nunca pela linha de comando.
- Senhas copiadas **não entram no histórico da área de transferência do Windows (Win+V) nem na nuvem**, e somem depois de 30 segundos.
- O cofre trava sozinho depois de alguns minutos sem uso (configurável).
- O Vitra não envia nenhum dado seu para lugar nenhum. Não há telemetria.

## Encontrou uma falha?

Por favor **não abra uma issue pública** para falhas de segurança. Use a aba **Security → Report a vulnerability** deste repositório (aviso privado). Responderemos assim que possível.
