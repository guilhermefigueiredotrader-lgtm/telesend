require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'messages.json');
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB, limite do Bot API do Telegram
const TELEGRAM_CAPTION_LIMIT = 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(ok ? null : new Error('Tipo de arquivo não suportado. Envie uma imagem ou um vídeo.'), ok);
  }
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Essa rota fica de fora da proteção por senha: é ela que diz ao site
// se uma senha é necessária, então precisa responder antes do login.
app.get('/api/config', (req, res) => {
  res.json({ requiresPassword: !!SITE_PASSWORD, configured: !!(BOT_TOKEN && CHAT_ID) });
});

// Arquivos de mídia: aceitam a senha tanto no cabeçalho quanto na URL
// (?pw=...), porque <img>/<video> não conseguem mandar cabeçalhos custom.
app.use('/api/uploads', (req, res, next) => {
  if (!SITE_PASSWORD) return next();
  if (req.headers['x-site-password'] === SITE_PASSWORD) return next();
  if (req.query.pw === SITE_PASSWORD) return next();
  return res.status(401).json({ error: 'Senha incorreta ou ausente.' });
}, express.static(UPLOAD_DIR));

// Proteção simples por senha (opcional). Se SITE_PASSWORD estiver definida,
// as demais rotas /api/* exigem o cabeçalho x-site-password com o valor certo.
app.use('/api', (req, res, next) => {
  if (!SITE_PASSWORD) return next();
  if (req.headers['x-site-password'] === SITE_PASSWORD) return next();
  return res.status(401).json({ error: 'Senha incorreta ou ausente.' });
});

function readMessages() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
}

function mediaTypeFromMimetype(mimetype) {
  if (mimetype.startsWith('image/')) return 'photo';
  if (mimetype.startsWith('video/')) return 'video';
  return null;
}

// Listar mensagens
app.get('/api/messages', (req, res) => {
  res.json(readMessages());
});

// --- Backup e restauração (usado antes/depois de atualizações no servidor) ---
// O disco do servidor pode não sobreviver a um novo deploy, então essas rotas
// permitem salvar tudo (mensagens + arquivos) e devolver exatamente como estava.

// Restaura a lista de mensagens inteira, exatamente como veio do backup
// (preserva id, status, agendamento, tudo — não é uma recriação).
app.post('/api/admin/restore-messages', (req, res) => {
  const messages = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Formato inválido: esperado uma lista de mensagens.' });
  }
  writeMessages(messages);
  res.json({ ok: true, count: messages.length });
});

// Sobe um arquivo de mídia (mesmas checagens do upload normal: só imagem/vídeo,
// nome gerado com segurança) e devolve o nome salvo, pra usar no restore-messages.
app.post('/api/admin/upload-media', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) {
      const mensagem = err.code === 'LIMIT_FILE_SIZE'
        ? 'Esse arquivo é maior que 50MB, que é o limite do Telegram para bots.'
        : err.message;
      return res.status(400).json({ error: mensagem });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    res.json({ filename: req.file.filename });
  });
});

// Criar rascunho novo (texto e/ou um arquivo de imagem/vídeo)
app.post('/api/messages', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) {
      const mensagem = err.code === 'LIMIT_FILE_SIZE'
        ? 'Esse arquivo é maior que 50MB, que é o limite do Telegram para bots.'
        : err.message;
      return res.status(400).json({ error: mensagem });
    }

    const text = (req.body.text || '').trim();
    const title = (req.body.title || '').trim();
    if (!text && !req.file) {
      return res.status(400).json({ error: 'Mande um texto ou anexe uma imagem/vídeo.' });
    }

    const messages = readMessages();
    const novaMensagem = {
      id: crypto.randomUUID(),
      title,
      text,
      status: 'rascunho', // rascunho | enviada
      createdAt: new Date().toISOString(),
      sentAt: null,
      mediaFile: req.file ? req.file.filename : null,
      mediaType: req.file ? mediaTypeFromMimetype(req.file.mimetype) : null,
      mediaOriginalName: req.file ? req.file.originalname : null,
      schedule: null
    };
    messages.unshift(novaMensagem);
    writeMessages(messages);
    res.status(201).json(novaMensagem);
  });
});

// Editar o título, texto e/ou a mídia (foto/vídeo) de um rascunho
app.put('/api/messages/:id', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) {
      const mensagem = err.code === 'LIMIT_FILE_SIZE'
        ? 'Esse arquivo é maior que 50MB, que é o limite do Telegram para bots.'
        : err.message;
      return res.status(400).json({ error: mensagem });
    }

    const { title, text, removeMedia } = req.body;
    const messages = readMessages();
    const msg = messages.find(m => m.id === req.params.id);
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    if (msg.status === 'enviada') {
      return res.status(400).json({ error: 'Não dá pra editar uma mensagem já enviada.' });
    }

    if (req.file) {
      if (msg.mediaFile) fs.unlink(path.join(UPLOAD_DIR, msg.mediaFile), () => {});
      msg.mediaFile = req.file.filename;
      msg.mediaType = mediaTypeFromMimetype(req.file.mimetype);
      msg.mediaOriginalName = req.file.originalname;
    } else if (removeMedia === 'true' && msg.mediaFile) {
      fs.unlink(path.join(UPLOAD_DIR, msg.mediaFile), () => {});
      msg.mediaFile = null;
      msg.mediaType = null;
      msg.mediaOriginalName = null;
    }

    const novoTexto = (text || '').trim();
    if (!novoTexto && !msg.mediaFile) {
      return res.status(400).json({ error: 'Mande um texto ou anexe uma imagem/vídeo.' });
    }
    msg.title = (title || '').trim();
    msg.text = novoTexto;
    writeMessages(messages);
    res.json(msg);
  });
});

// Clonar mensagem: cria uma cópia independente como novo rascunho (sem agendamento e sem status de enviada)
app.post('/api/messages/:id/clone', (req, res) => {
  const messages = readMessages();
  const original = messages.find(m => m.id === req.params.id);
  if (!original) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  let novoMediaFile = null;
  if (original.mediaFile) {
    const ext = path.extname(original.mediaFile);
    novoMediaFile = `${crypto.randomUUID()}${ext}`;
    fs.copyFileSync(path.join(UPLOAD_DIR, original.mediaFile), path.join(UPLOAD_DIR, novoMediaFile));
  }

  const clone = {
    id: crypto.randomUUID(),
    title: original.title ? `${original.title} (cópia)` : '',
    text: original.text,
    status: 'rascunho',
    createdAt: new Date().toISOString(),
    sentAt: null,
    mediaFile: novoMediaFile,
    mediaType: original.mediaType,
    mediaOriginalName: original.mediaOriginalName,
    schedule: null
  };

  messages.unshift(clone);
  writeMessages(messages);
  res.status(201).json(clone);
});

// Excluir mensagem (e o arquivo de mídia associado, se houver)
app.delete('/api/messages/:id', (req, res) => {
  let messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (msg.mediaFile) {
    fs.unlink(path.join(UPLOAD_DIR, msg.mediaFile), () => {});
  }
  messages = messages.filter(m => m.id !== req.params.id);
  writeMessages(messages);
  res.status(204).end();
});

// Enviar mensagem pro Telegram agora
app.post('/api/messages/:id/send', async (req, res) => {
  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({
      error: 'O site ainda não está configurado. Faltam TELEGRAM_BOT_TOKEN e/ou TELEGRAM_CHAT_ID.'
    });
  }

  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  try {
    await enviarMensagemCompleta(msg);
    msg.status = 'enviada';
    msg.sentAt = new Date().toISOString();
    writeMessages(messages);
    res.json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Agendar uma mensagem: uma vez (data/hora) ou recorrente (horário + dias da semana)
app.post('/api/messages/:id/schedule', (req, res) => {
  const { type, scheduledAt, time, daysOfWeek } = req.body;
  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  if (type === 'once') {
    const quando = new Date(scheduledAt);
    if (!scheduledAt || isNaN(quando.getTime()) || quando <= new Date()) {
      return res.status(400).json({ error: 'Escolha uma data e hora no futuro.' });
    }
    msg.schedule = {
      type: 'once',
      scheduledAt: quando.toISOString(),
      time: null,
      daysOfWeek: null,
      status: 'programado',
      nextRun: quando.toISOString(),
      lastRun: null,
      runCount: 0,
      lastError: null
    };
  } else if (type === 'recurring') {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'Escolha um horário válido.' });
    }
    const dias = Array.isArray(daysOfWeek) ? daysOfWeek.map(Number).filter(d => d >= 0 && d <= 6) : [];
    const proxima = computeNextRun(time, dias, new Date());
    msg.schedule = {
      type: 'recurring',
      scheduledAt: null,
      time,
      daysOfWeek: dias,
      status: 'ativo',
      nextRun: proxima ? proxima.toISOString() : null,
      lastRun: null,
      runCount: 0,
      lastError: null
    };
  } else {
    return res.status(400).json({ error: 'Tipo de agendamento inválido.' });
  }

  writeMessages(messages);
  res.json(msg);
});

// Cancelar um agendamento único que ainda não foi executado
app.post('/api/messages/:id/schedule/cancel', (req, res) => {
  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg || !msg.schedule) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  msg.schedule.status = 'cancelado';
  writeMessages(messages);
  res.json(msg);
});

// Pausar / retomar um agendamento recorrente
app.post('/api/messages/:id/schedule/pause', (req, res) => {
  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg || !msg.schedule || msg.schedule.type !== 'recurring') {
    return res.status(404).json({ error: 'Agendamento recorrente não encontrado.' });
  }
  msg.schedule.status = 'pausado';
  writeMessages(messages);
  res.json(msg);
});

app.post('/api/messages/:id/schedule/resume', (req, res) => {
  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg || !msg.schedule || msg.schedule.type !== 'recurring') {
    return res.status(404).json({ error: 'Agendamento recorrente não encontrado.' });
  }
  const proxima = computeNextRun(msg.schedule.time, msg.schedule.daysOfWeek, new Date());
  msg.schedule.status = 'ativo';
  msg.schedule.nextRun = proxima ? proxima.toISOString() : null;
  writeMessages(messages);
  res.json(msg);
});

// Remover o agendamento (a mensagem volta a ser um rascunho comum)
app.delete('/api/messages/:id/schedule', (req, res) => {
  const messages = readMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  msg.schedule = null;
  writeMessages(messages);
  res.json(msg);
});

async function chamarTelegram(metodo, form) {
  const resposta = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders ? form.getHeaders() : { 'Content-Type': 'application/json' }
  });
  const dados = await resposta.json();
  if (!dados.ok) {
    throw new Error('Telegram recusou o envio: ' + dados.description);
  }
  return dados;
}

async function enviarMensagemCompleta(msg) {
  if (msg.mediaFile) {
    await enviarComMidia(msg);
  } else {
    await enviarTextoSimples(msg.text);
  }
}

// Tenta enviar com formatação (*negrito*, _itálico_, `código`, [link](url)).
// Se o texto tiver um asterisco/underline "solto" que não forma um par válido,
// o Telegram recusa o parse — nesse caso reenviamos sem formatação, sem perder a mensagem.
async function chamarTelegramComFallback(metodo, montarForm) {
  try {
    return await chamarTelegram(metodo, montarForm(true));
  } catch (err) {
    if (!/can't parse entities/i.test(err.message)) throw err;
    return chamarTelegram(metodo, montarForm(false));
  }
}

async function enviarTextoSimples(texto) {
  return chamarTelegramComFallback('sendMessage', (comFormatacao) => {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('text', texto);
    if (comFormatacao) form.append('parse_mode', 'Markdown');
    return form;
  });
}

async function enviarComMidia(msg) {
  const caminhoArquivo = path.join(UPLOAD_DIR, msg.mediaFile);
  const metodo = msg.mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
  const campoArquivo = msg.mediaType === 'video' ? 'video' : 'photo';
  const legendaCabe = msg.text.length <= TELEGRAM_CAPTION_LIMIT;

  await chamarTelegramComFallback(metodo, (comFormatacao) => {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append(campoArquivo, fs.createReadStream(caminhoArquivo));
    if (msg.text && legendaCabe) {
      form.append('caption', msg.text);
      if (comFormatacao) form.append('parse_mode', 'Markdown');
    }
    return form;
  });

  // Se o texto for grande demais pra caber na legenda, manda como mensagem à parte
  if (msg.text && !legendaCabe) {
    await enviarTextoSimples(msg.text);
  }
}

// Calcula a próxima data/hora em que um agendamento recorrente deve rodar.
// daysOfWeek: 0=domingo...6=sábado. Vazio/null = todo dia.
function computeNextRun(time, daysOfWeek, fromDate) {
  const [hh, mm] = time.split(':').map(Number);
  const dias = (daysOfWeek && daysOfWeek.length) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

  for (let addDays = 0; addDays <= 7; addDays++) {
    const candidato = new Date(fromDate);
    candidato.setDate(candidato.getDate() + addDays);
    candidato.setHours(hh, mm, 0, 0);
    if (dias.includes(candidato.getDay()) && candidato > fromDate) {
      return candidato;
    }
  }
  return null;
}

// Roda a cada 30 segundos: dispara mensagens agendadas (únicas ou recorrentes) que já chegaram na hora.
const INTERVALO_VERIFICACAO_MS = 30 * 1000;

async function verificarAgendamentos() {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const messages = readMessages();
  const agora = new Date();
  let mudou = false;

  for (const msg of messages) {
    const ag = msg.schedule;
    if (!ag) continue;

    if (ag.type === 'once' && ag.status === 'programado' && new Date(ag.scheduledAt) <= agora) {
      mudou = true;
      try {
        await enviarMensagemCompleta(msg);
        msg.status = 'enviada';
        msg.sentAt = agora.toISOString();
        ag.status = 'executado';
        ag.lastRun = agora.toISOString();
      } catch (err) {
        ag.status = 'erro';
        ag.lastError = err.message;
      }
    }

    if (ag.type === 'recurring' && ag.status === 'ativo' && ag.nextRun && new Date(ag.nextRun) <= agora) {
      mudou = true;
      try {
        await enviarMensagemCompleta(msg);
        ag.lastError = null;
      } catch (err) {
        ag.lastError = err.message;
      }
      ag.lastRun = agora.toISOString();
      ag.runCount = (ag.runCount || 0) + 1;
      const proxima = computeNextRun(ag.time, ag.daysOfWeek, agora);
      ag.nextRun = proxima ? proxima.toISOString() : null;
    }
  }

  if (mudou) writeMessages(messages);
}

setInterval(() => {
  verificarAgendamentos().catch(err => console.error('Erro ao verificar agendamentos:', err));
}, INTERVALO_VERIFICACAO_MS);

app.listen(PORT, () => {
  console.log(`Telegram Mensageiro rodando na porta ${PORT}`);
});
