# TeleSend

Site simples onde você escreve mensagens (com um título só seu, pra
identificar depois, e podendo anexar uma foto ou vídeo), deixa guardadas
como rascunho, e clica em "Enviar agora" quando quiser — elas vão direto
pro seu canal ou grupo do Telegram. O título é só pra você organizar; ele
não é enviado ao Telegram, só o texto e a mídia.

**Sobre os anexos:** cada mensagem pode ter uma foto ou um vídeo (não os
dois juntos), até 50MB — esse é o limite do próprio Telegram para bots. O
texto vira a legenda da foto/vídeo. Se o texto passar de 1024 caracteres
(limite do Telegram para legendas), o site manda a mídia sem legenda e o
texto completo logo em seguida, como uma segunda mensagem.

**Sobre o agendamento:** em qualquer rascunho, clique em "⏰ Agendar" para
escolher entre:
- **Uma vez** — escolhe data e hora exatas; a mensagem é enviada sozinha
  quando chegar a hora, sem você precisar estar com o site aberto.
- **Recorrente** — escolhe um horário e (opcionalmente) dias da semana
  específicos; se não marcar nenhum dia, ela repete todo dia. Dá pra
  pausar, retomar ou remover o agendamento a qualquer momento na aba
  "📅 Agendamentos".

O site confere a cada 30 segundos se alguma mensagem agendada chegou na
hora certa, então **isso só funciona enquanto o servidor estiver
rodando** — veja o alerta abaixo sobre isso no Render.

## Passo 1 — Descobrir o ID do seu canal/grupo

Você já tem o token do bot. Agora precisa do **ID do canal ou grupo** (o
`TELEGRAM_CHAT_ID`):

1. Adicione seu bot como **administrador** do canal/grupo (Configurações do
   canal → Administradores → Adicionar administrador → escolha seu bot).
2. Envie qualquer mensagem no canal/grupo.
3. No navegador, acesse (troque `SEU_TOKEN` pelo token do seu bot):
   `https://api.telegram.org/botSEU_TOKEN/getUpdates`
4. Procure por `"chat":{"id":-100...` na resposta. Esse número (com o sinal
   de menos, se tiver) é o seu `TELEGRAM_CHAT_ID`.

Se o canal for público (tem um @nomedecanal), você também pode simplesmente
usar `@nomedecanal` como `TELEGRAM_CHAT_ID`, sem precisar desse passo.

## Passo 2 — Publicar o site (grátis, via Render)

1. Crie uma conta em [render.com](https://render.com) (dá pra entrar com
   GitHub).
2. Suba esta pasta `telegram-mensageiro` para um repositório no GitHub
   (posso te ajudar com isso).
3. No Render, clique em **New +** → **Web Service** → conecte o
   repositório.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Em **Environment Variables**, adicione:
   - `TELEGRAM_BOT_TOKEN` → o token do seu bot
   - `TELEGRAM_CHAT_ID` → o ID que você achou no Passo 1
   - `SITE_PASSWORD` → (opcional) uma senha pra ninguém mais acessar o site
6. Clique em **Deploy**. Em alguns minutos o Render te dá um link tipo
   `https://mensageiro-telegram.onrender.com` — esse é o site, acessível do
   celular ou de onde você estiver.

## ⚠️ Muito importante: agendamento precisa do servidor acordado

No plano **grátis** do Render, o site "dorme" depois de uns 15 minutos sem
ninguém acessar — e enquanto está dormindo, o agendador não roda, então uma
mensagem agendada pra aquele horário só sai quando alguém acessar o site de
novo (o que acorda ele). Isso quebra justamente o propósito do
agendamento (enviar sozinho, sem você precisar abrir o site).

Duas formas de resolver:

1. **Grátis:** use um serviço como o [UptimeRobot](https://uptimerobot.com)
   (gratuito) pra "pingar" o link do seu site a cada 5 minutos. Isso mantém
   o Render sempre acordado. Posso te ajudar a configurar isso depois do
   deploy.
2. **Pago:** no Render, mude o serviço pra um plano "Starter" (a partir de
   uns US$7/mês), que não dorme nunca.

Se você só vai usar o botão "Enviar agora" manualmente (sem depender de
agendamento), pode ignorar esse alerta — o plano grátis funciona bem nesse
caso.

## Importante sobre os rascunhos salvos

As mensagens (e as fotos/vídeos anexados) ficam guardadas direto no
servidor. Isso funciona bem no dia a dia, mas **se você fizer um novo
deploy** (subir uma atualização do código), esses arquivos podem ser
reiniciados e os rascunhos salvos se perdem. Não é um problema para o uso
normal (escrever e enviar logo em seguida), só vale saber.

## Rodar no seu computador (opcional, antes de publicar)

Precisa ter o [Node.js](https://nodejs.org) instalado. Depois:

```bash
npm install
copy .env.example .env
```

Edite o arquivo `.env` com seu token e chat ID, depois:

```bash
npm start
```

Acesse `http://localhost:3000` no navegador.
